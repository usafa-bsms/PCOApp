# PCOApp Architecture

## Goal
Produce a Preferred Course Offering (PCO) for a BSMS semester: assign each planned course section an instructor and a period (M1–M6 / T1–T6), satisfying hard locks and minimizing weighted constraint penalties while honoring instructor preferences.

## Decisions (confirmed)
- **Scheduling is client-side and deterministic.** The same inputs always yield the same schedule on any machine, so any Academic Director reproduces the same result. The current run's output is written to the DB for faculty to view.
- **Roles** = `faculty`, `academic_director`, `lead_admin`. `persons.label` is a free-text tag (advisor, dept head, affiliate) that does NOT grant authorization, only context (e.g., explains a changed course load).
- **Auth** = Supabase email/password. RLS is the enforcement layer.
- **Hosting** = GitHub Pages (static build). Env baked at build time via Actions secrets.

## Inputs → solver → outputs
```
persons (roster + role + label + course load)
course_list (per-semester, sections, expected enrollment)
qualifications (person × course × level)
periods (M1..T6, day, part-of-day)        ─┐
classrooms (name, capacity)               ─┤ inputs
preferences (faculty wants: course/period)─┤
locks (AD: director, forced assignment)   ─┤ (hard)
constraints (semester guidelines + penalty)─┘
        │  (deterministic client-side solver)
        ▼
schedule_runs + schedule_assignments  →  written to Supabase, read by faculty
```

- Hard: AD locks. Soft: preferences + all constraints (each has an integer penalty; higher penalty ⇒ violated/relaxed later).
- Course "director" is a specific person for a course, distinct from teaching sections.

## Solver determinism invariants
1. No randomness (no `Math.random`/shuffle). Any nondeterminism is a bug.
2. Iterate periods, persons, courses in canonical sorted order — never rely on DB/insertion order.
3. Pure functions only in `src/scheduler/`: take typed input, return a result and a score. No I/O, no network.
4. Search is a weighted best-first / constraint relaxation over candidate assignments; ties broken deterministically.

## Directory layout
```
src/
  env.ts                 # validate VITE_* at startup
  utils/supabase.ts      # supabase client
  context/AuthContext.tsx# whoami, login/logout, role
  hooks/useRbac.ts
  lib/
    rbac.ts              # role checks + labels
    periods.ts           # canonical M1..T6 metadata
    supabase-tables.ts   # typed row accessors (reads)
    api.ts               # mutations guarded by role
  scheduler/
    types.ts             # input/output/solution types
    normalize.ts         # canonical ordering of inputs
    constraints.ts       # penalty evaluations
    solver.ts            # deterministic search
    score.ts
    index.ts             # run(input) => { solution, score, violates }
    __tests__/solver.test.ts
  pages/
    LoginPage.tsx
    (Roster, Courses, Qualifications, Preferences,
     Locks, Constraints, Schedule) Page.tsx
  components/
  routes.tsx / App.tsx
```

## Database schema (tables)
All input/result tables carry `semester_id` (PCO is per-semester).
- `semesters` — id, name (e.g. "Fall 2026"), start, end.
- `persons` — id (uuid, links auth), name, email, role (enum), label (text, nullable), course_load (int). One row per faculty member.
- `course_list` — id, semester_id, code (e.g. MATH 411), title, sections (int), expected_enrollment (int).
- `qualifications` — id, person_id, course_id, level (enum: `can_teach | has_taught | can_direct`). One row per level; multiple levels allowed per person+course.
- `periods` — id, semester_id, code (M1..T6), day (enum `M|T`), slot (1..6), part_of_day (enum `morning|afternoon`).
- `classrooms` — id, semester_id, name, capacity (int; data only for now).
- `preferences` — id, person_id, semester_id, kind (enum `course|period`), course_id (nullable), period_id (nullable), rank (int). Faculty "want to teach X / teach during Y".
- `locks` — id, semester_id, person_id, course_id, period_id (nullable), lock_type (enum `course_director | assignment`), note. HARD.
- `constraints` — id, semester_id, name, type (enum: `spread_sections | morning_min | afternoon_min | balance_mt | ...`), penalty (int), params (jsonb).
- `schedule_runs` — id, semester_id, created_by, created_at, status (enum `running|done|failed`), solution_hash (for reproducibility), score (int).
- `schedule_assignments` — id, run_id, person_id, course_id, section (int), period_id, role (enum `director|teacher`).

## RLS model
- Everyone (authenticated faculty) can read: `course_list`, `periods`, `classrooms`, `constraints` (final PCO view), `schedule_runs` + `schedule_assignments` (view results).
- `persons`: users read their own row; AD/lead can read full roster.
- Writes split by role:
  - faculty → upsert own `preferences`.
  - academic_director + lead_admin → `locks`, `constraints`.
  - lead_admin → `course_list`, `qualifications`, `semesters`, `persons` (onboarding), `classrooms`.
- Use RLS policies keyed on the current user's `persons.role`. App-role checks in `lib/rbac.ts` are UX only.

## Roadmap
1. Scaffold + auth (this step).
2. Seed input tables + CRUD pages for inputs.
3. Solver (deterministic) + unit tests.
4. Run/visualize schedule; persist results; faculty view.
5. Iterate on constraint set with real sample inputs.