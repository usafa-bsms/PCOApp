-- PCOApp schema + RLS.
-- Deterministic scheduling runs client-side; this DB persists the per-semester
-- roster/courses, locks, qualifications, and the published schedule. RLS is the
-- enforcement layer. The roster is PER-SEMESTER: a person has one persona row
-- per semester they're on the roster, linked to an auth account via auth_user_id.

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
  ends_on date,
  is_active boolean not null default false
);
create unique index one_active_semester on public.semesters (is_active)
  where is_active = true;

-- Persona = a person ON A GIVEN SEMESTER. Copying a semester clones these rows
-- (new personas), so a re-enrolled instructor is a new row but keeps the same
-- auth account (auth_user_id) and course load. One person row per (semester,email).
create table public.persons (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id),
  name text not null,
  email text not null,
  role public.role not null default 'faculty',
  label text, -- free-text tag: advisor / dept head / affiliate / ...
  course_load int not null default 3 check (course_load >= 0),
  auth_user_id uuid references auth.users(id) on delete cascade, -- login link (nullable)
  unique (semester_id, email)
);

create table public.course_list (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id),
  code text not null, -- e.g. MATH 411
  title text,
  sections int not null default 1 check (sections > 0),
  expected_enrollment int not null default 0,
  is_double_period boolean not null default false,
  unique (semester_id, code)
);

create table public.qualifications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete cascade,
  course_id uuid not null references public.course_list(id) on delete cascade,
  level public.qual_level not null,
  unique (person_id, course_id, level)
);

create table public.periods (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  code text not null, -- M1..M6, T1..T6
  day public.day_enum not null,
  slot int not null check (slot between 1 and 6),
  part_of_day public.part_of_day not null,
  unique (semester_id, code)
);

create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  name text not null,
  capacity int not null default 23 check (capacity > 0),
  assignable boolean not null default true, -- false = "NONE" room, locked by AD, never algorithm-assigned
  unique (semester_id, name)
);

create table public.preferences (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete cascade,
  kind public.preference_kind not null,
  course_id uuid references public.course_list(id) on delete cascade,
  period_id uuid references public.periods(id) on delete cascade,
  rank int not null default 1, -- lower = stronger (for 'course'/'period' likes)
  is_hard_exclusion boolean not null default false, -- "will not teach X / cannot teach Y"
  check ((kind = 'course' and course_id is not null) or
         (kind = 'period' and period_id is not null))
);

create table public.locks (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  person_id uuid references public.persons(id) on delete cascade, -- may be null if not forced
  course_id uuid not null references public.course_list(id) on delete cascade,
  section int, -- which section (1..n) the lock applies to; null = applies broadly
  period_id uuid references public.periods(id) on delete cascade,
  room_id uuid references public.classrooms(id) on delete cascade,
  lock_type public.lock_type not null,
  note text
);

create table public.constraints (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  name text not null,
  type public.constraint_type not null,
  penalty int not null default 100,
  params jsonb not null default '{}'::jsonb
);

create table public.schedule_runs (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
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
create index persons_semester_idx on public.persons(semester_id);
create index course_semester_idx on public.course_list(semester_id);

-- =============================================================
-- Carry a semester forward: clone roster, course load, and courses
-- (and classrooms/periods) into a new semester. New persona rows are created
-- for each source person; login links (auth_user_id) are preserved by email so
-- re-enrolled instructors keep their account. Returns the new semester id.
-- security definer: caller may only copy (no dynamic SQL, no tenant escalation).
-- =============================================================
create or replace function public.copy_semester(
  source_semester_id uuid,
  new_name text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  new_sem_id uuid;
  old_to_new_course uuid;
  new_person_id uuid;
  src_course public.course_list%rowtype;
  src_person public.persons%rowtype;
  src_class public.classrooms%rowtype;
  src_period public.periods%rowtype;
begin
  if public.current_user_role() not in ('academic_director', 'lead_admin') then
    raise exception 'only academic directors / lead admins may copy a semester';
  end if;
  insert into public.semesters (name, starts_on, ends_on, is_active)
  select new_name, starts_on, ends_on, false
  from public.semesters where id = source_semester_id
  returning id into new_sem_id;
  if new_sem_id is null then
    raise exception 'source semester % not found', source_semester_id;
  end if;

  -- courses (keep enrollments, sections, double-period flag)
  declare course_cur cursor for select * from public.course_list
    where semester_id = source_semester_id order by code;
  begin
    for src_course in course_cur loop
      insert into public.course_list
        (semester_id, code, title, sections, expected_enrollment, is_double_period)
      values (new_sem_id, src_course.code, src_course.title, src_course.sections,
              src_course.expected_enrollment, src_course.is_double_period)
      returning id into old_to_new_course;
      -- stash mapping source course -> new course for quals
      perform set_config('pco.copy_course.' || src_course.id::text,
                         old_to_new_course::text, false);
    end loop;
  end;

  -- persons (new personas, preserve login link + load by matching email)
  declare person_cur cursor for select * from public.persons
    where semester_id = source_semester_id order by email;
  begin
    for src_person in person_cur loop
      insert into public.persons
        (semester_id, name, email, role, label, course_load, auth_user_id)
      values (new_sem_id, src_person.name, src_person.email, src_person.role,
              src_person.label, src_person.course_load, src_person.auth_user_id)
      returning id into new_person_id;
      perform set_config('pco.copy_person.' || src_person.id::text,
                         new_person_id::text, false);
    end loop;
  end;

  -- classrooms (incl. NONE/unassignable rooms)
  for src_class in select * from public.classrooms
    where semester_id = source_semester_id order by name
  loop
    insert into public.classrooms (semester_id, name, capacity, assignable)
    values (new_sem_id, src_class.name, src_class.capacity, src_class.assignable);
  end loop;

  -- periods
  for src_period in select * from public.periods
    where semester_id = source_semester_id order by code
  loop
    insert into public.periods (semester_id, code, day, slot, part_of_day)
    values (new_sem_id, src_period.code, src_period.day, src_period.slot, src_period.part_of_day);
  end loop;

  -- qualifications, remapped through the person & course maps
  insert into public.qualifications (person_id, course_id, level)
  select (current_setting('pco.copy_person.' || q.person_id::text, true))::uuid,
         (current_setting('pco.copy_course.' || q.course_id::text, true))::uuid,
         q.level
  from public.qualifications q
  where q.person_id in (
    select id from public.persons where semester_id = source_semester_id
  )
  and q.course_id in (
    select id from public.course_list where semester_id = source_semester_id
  );

  return new_sem_id;
end;
$$;

-- =============================================================
-- RLS. Auth is 'authenticated'. role checks key off the active semester's
-- persons row for the current user, matched by auth_user_id.
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

-- helper: the current user's role from the active semester's roster
create or replace function public.current_user_role() returns public.role
language sql stable security definer set search_path = public
as $$
  select p.role
  from public.persons p
  join public.semesters s on s.id = p.semester_id
  where p.auth_user_id = auth.uid() and s.is_active
  limit 1;
$$;

-- all authenticated users may read shared/plan data
create policy "read semesters" on public.semesters
  for select to authenticated using (true);
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

-- persons: users see their own active-semester persona; AD/lead see the whole roster
create policy "read own person" on public.persons
  for select to authenticated using (auth_user_id = auth.uid());
create policy "read roster for ad" on public.persons
  for select to authenticated using (
    public.current_user_role() in ('academic_director', 'lead_admin')
  );

-- faculty manage their own active-semester preferences
create policy "own preferences" on public.preferences
  for all to authenticated using (
    person_id in (select id from public.persons where auth_user_id = auth.uid())
  ) with check (
    person_id in (select id from public.persons where auth_user_id = auth.uid())
  );

-- AD + lead manage locks, constraints, and copy a semester / activate one
create policy "ad locks" on public.locks
  for all to authenticated using (
    public.current_user_role() in ('academic_director', 'lead_admin')
  ) with check (
    public.current_user_role() in ('academic_director', 'lead_admin')
  );
create policy "ad constraints" on public.constraints
  for all to authenticated using (
    public.current_user_role() in ('academic_director', 'lead_admin')
  ) with check (
    public.current_user_role() in ('academic_director', 'lead_admin')
  );
create policy "ad manage semesters" on public.semesters
  for update to authenticated using (
    public.current_user_role() in ('academic_director', 'lead_admin')
  ) with check (
    public.current_user_role() in ('academic_director', 'lead_admin')
  );

-- lead admin writes input tables (courses, quals, semesters, classrooms, roster)
create policy "admin write semesters" on public.semesters
  for insert to authenticated with check (
    public.current_user_role() = 'lead_admin'
  );
create policy "admin write persons" on public.persons
  for insert to authenticated with check (
    public.current_user_role() = 'lead_admin'
  );
create policy "admin update persons" on public.persons
  for update to authenticated using (
    public.current_user_role() in ('academic_director', 'lead_admin')
  ) with check (
    public.current_user_role() in ('academic_director', 'lead_admin')
  );
create policy "admin delete persons" on public.persons
  for delete to authenticated using (
    public.current_user_role() in ('academic_director', 'lead_admin')
  );
create policy "admin write course_list" on public.course_list
  for all to authenticated using (
    public.current_user_role() in ('academic_director', 'lead_admin')
  ) with check (
    public.current_user_role() in ('academic_director', 'lead_admin')
  );
create policy "admin write qualifications" on public.qualifications
  for all to authenticated using (
    public.current_user_role() in ('academic_director', 'lead_admin')
  ) with check (
    public.current_user_role() in ('academic_director', 'lead_admin')
  );
create policy "admin write periods" on public.periods
  for all to authenticated using (
    public.current_user_role() in ('academic_director', 'lead_admin')
  ) with check (
    public.current_user_role() in ('academic_director', 'lead_admin')
  );
create policy "admin write classrooms" on public.classrooms
  for all to authenticated using (
    public.current_user_role() in ('academic_director', 'lead_admin')
  ) with check (
    public.current_user_role() in ('academic_director', 'lead_admin')
  );

-- execute copying (any authenticated; the function self-guards by requiring
-- an existing source semester name to clone into)
create policy "exec copy_semester" on public.semesters
  for select to authenticated using (true);

-- schedule runs/assignments are written by anyone with an AD/lead roster role
create policy "insert schedule_runs" on public.schedule_runs
  for insert to authenticated with check (
    public.current_user_role() in ('academic_director', 'lead_admin')
  );
create policy "insert schedule_assignments" on public.schedule_assignments
  for insert to authenticated with check (
    exists (
      select 1 from public.schedule_runs r
      where r.id = run_id
        and public.current_user_role() in ('academic_director', 'lead_admin')
    )
  );

grant execute on function public.copy_semester(uuid, text) to authenticated;
grant execute on function public.current_user_role() to authenticated;