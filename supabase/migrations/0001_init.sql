-- PCOApp schema + RLS.
-- Deterministic scheduling runs client-side; this DB persists inputs, locks,
-- and the published schedule. RLS is the enforcement layer.

create type public.role as enum
  ('faculty', 'new_instructor', 'academic_director', 'lead_admin');
create type public.qual_level as enum ('can_teach', 'has_taught', 'can_direct');
create type public.preference_kind as enum ('course', 'period');
create type public.lock_type as enum ('course_director', 'assignment');
create type public.day_enum as enum ('M', 'T');
create type public.part_of_day as enum ('morning', 'afternoon');
create type public.constraint_type as enum
  ('spread_sections', 'morning_min', 'afternoon_min', 'balance_mt',
   'consecutive_periods', 'single_day', 'no_forced_break',
   'single_offering_peak', 'two_section_same_block');
create type public.run_status as enum ('running', 'done', 'failed');
create type public.assignment_role as enum ('director', 'teacher');

create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date,
  ends_on date
);

create table public.persons (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role public.role not null default 'faculty',
  label text, -- free-text tag: advisor / dept head / affiliate / ...
  course_load int not null default 3 check (course_load >= 0)
);

create table public.course_list (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id),
  code text not null, -- e.g. MATH 411
  title text,
  sections int not null default 1 check (sections > 0),
  expected_enrollment int not null default 0,
  unique (semester_id, code)
);

create table public.qualifications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id),
  course_id uuid not null references public.course_list(id),
  level public.qual_level not null,
  unique (person_id, course_id, level)
);

create table public.periods (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id),
  code text not null, -- M1..M6, T1..T6
  day public.day_enum not null,
  slot int not null check (slot between 1 and 6),
  part_of_day public.part_of_day not null,
  unique (semester_id, code)
);

create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id),
  name text not null,
  capacity int not null default 23 check (capacity > 0)
);

create table public.preferences (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id),
  semester_id uuid not null references public.semesters(id),
  kind public.preference_kind not null,
  course_id uuid references public.course_list(id),
  period_id uuid references public.periods(id),
  rank int not null default 1, -- lower = stronger (for 'course'/'period' likes)
  is_hard_exclusion boolean not null default false, -- "will not teach X / cannot teach Y"
  check ((kind = 'course' and course_id is not null) or
         (kind = 'period' and period_id is not null))
);

create table public.locks (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id),
  person_id uuid references public.persons(id), -- may be left null if not forced
  course_id uuid not null references public.course_list(id),
  section int, -- which section (1..n) the lock applies to; null = applies broadly
  period_id uuid references public.periods(id),
  room_id uuid references public.classrooms(id),
  lock_type public.lock_type not null,
  note text
);

create table public.constraints (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id),
  name text not null,
  type public.constraint_type not null,
  penalty int not null default 100,
  params jsonb not null default '{}'::jsonb
);

create table public.schedule_runs (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id),
  created_by uuid not null references public.persons(id),
  created_at timestamptz not null default now(),
  status public.run_status not null default 'running',
  score int,
  solution_hash uuid -- reproducibility marker
);

create table public.schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.schedule_runs(id) on delete cascade,
  person_id uuid not null references public.persons(id),
  course_id uuid not null references public.course_list(id),
  section int not null,
  period_id uuid not null references public.periods(id),
  room_id uuid references public.classrooms(id),
  role public.assignment_role not null default 'teacher'
);

create index schedule_assignments_run_idx on public.schedule_assignments(run_id);
create index qualifications_person_idx on public.qualifications(person_id);

-- =============================================================
-- RLS. Auth is 'authenticated'. role checks key off persons.role.
-- =============================================================
alter table public.semesters enable row level security;
alter table public.persons enable row level security;
alter table public.course_list enable row level security;
alter table public.qualifications enable row level security;
alter table public.periods enable row level security;
alter table public.classrooms enable row level security;
alter table public.preferences enable row level security;
alter table public.locks enable row level security;
alter table public.constraints enable row level security;
alter table public.schedule_runs enable row level security;
alter table public.schedule_assignments enable row level security;

-- all authenticated users may read shared/plan data
create policy "read course_list" on public.course_list
  for select to authenticated using (true);
create policy "read periods" on public.periods
  for select to authenticated using (true);
create policy "read classrooms" on public.classrooms
  for select to authenticated using (true);
create policy "read constraints" on public.constraints
  for select to authenticated using (true);
create policy "read schedule_runs" on public.schedule_runs
  for select to authenticated using (true);
create policy "read schedule_assignments" on public.schedule_assignments
  for select to authenticated using (true);
create policy "read qualifications" on public.qualifications
  for select to authenticated using (true);

-- persons: users see their own row; AD/lead see the roster
create policy "read own person" on public.persons
  for select to authenticated using (id = auth.uid());
create policy "read roster for ad" on public.persons
  for select to authenticated using (
    (select role from public.persons where id = auth.uid()) in
    ('academic_director', 'lead_admin')
  );

-- faculty manage their own preferences
create policy "own preferences" on public.preferences
  for all to authenticated using (person_id = auth.uid()) with check (person_id = auth.uid());

-- AD + lead manage locks and constraints
create policy "ad locks" on public.locks
  for all to authenticated using (
    (select role from public.persons where id = auth.uid()) in
    ('academic_director', 'lead_admin')
  ) with check (
    (select role from public.persons where id = auth.uid()) in
    ('academic_director', 'lead_admin')
  );
create policy "ad constraints" on public.constraints
  for insert to authenticated with check (
    (select role from public.persons where id = auth.uid()) in
    ('academic_director', 'lead_admin')
  );

-- lead admin writes input tables (roster, courses, quals, semesters, classrooms)
create policy "admin write semesters" on public.semesters
  for all to authenticated using (
    (select role from public.persons where id = auth.uid()) = 'lead_admin'
  ) with check (
    (select role from public.persons where id = auth.uid()) = 'lead_admin'
  );
create policy "admin write persons" on public.persons
  for insert to authenticated with check (
    (select role from public.persons where id = auth.uid()) = 'lead_admin'
  );
create policy "admin write course_list" on public.course_list
  for insert to authenticated with check (
    (select role from public.persons where id = auth.uid()) = 'lead_admin'
  );
create policy "admin write qualifications" on public.qualifications
  for all to authenticated using (
    (select role from public.persons where id = auth.uid()) = 'lead_admin'
  ) with check (
    (select role from public.persons where id = auth.uid()) = 'lead_admin'
  );
create policy "admin write periods" on public.periods
  for all to authenticated with check (
    (select role from public.persons where id = auth.uid()) = 'lead_admin'
  );
create policy "admin write classrooms" on public.classrooms
  for all to authenticated using (
    (select role from public.persons where id = auth.uid()) = 'lead_admin'
  ) with check (
    (select role from public.persons where id = auth.uid()) = 'lead_admin'
  );

-- schedule runs/assignments are written by anyone who ran the solver (AD/lead)
create policy "insert schedule_runs" on public.schedule_runs
  for insert to authenticated with check (
    (select role from public.persons where id = auth.uid()) in
    ('academic_director', 'lead_admin')
  );
create policy "insert schedule_assignments" on public.schedule_assignments
  for insert to authenticated with check (
    exists (
      select 1 from public.schedule_runs r
      join public.persons p on p.id = auth.uid()
      where r.id = run_id and p.role in ('academic_director', 'lead_admin')
    )
  );