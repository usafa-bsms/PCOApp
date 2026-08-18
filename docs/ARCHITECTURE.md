# PCOApp Architecture

## Goal
Produce a Preferred Course Offering (PCO) for a BSMS semester: assign each planned course section an instructor and a period (M1–M6 / T1–T6), satisfying hard locks and minimizing weighted constraint penalties while honoring instructor preferences.

## Decisions (confirmed)
- **Scheduling is client-side and deterministic.** The same inputs always yield the same schedule on any machine, so any Academic Director reproduces the same result. The current run's output is written to the DB for faculty to view.
- **Roles** = `faculty`, `new_instructor`, `academic_director`, `lead_admin`. `new_instructor` defaults to load 4; others 3. `persons.label` is a free-text tag (advisor, dept head, affiliate) that does NOT grant authorization, only context.
- **Course load is a per-person TARGET**, not a hard cap. Reduced manually for extra responsibilities (pilot, double-prep); manual input wins.
- **Locks are HARD**, may pin any subset of `course → section → period → room → instructor`. Person/period/room optional; solver keeps the locked parts, fills the rest. A course director is a course-level role (does not itself use a teaching period or count toward load) — e.g. Math 243/253 CD teaches only one of the pair.
- **Faculty preferences** = weighted points (lower rank = stronger) plus **hard exclusions**. Exclusions are hard; ADs may remove them.
- **Auth** = Supabase email/password. RLS is the enforcement layer.
- **Hosting** = GitHub Pages (static build). Env baked at build time via Actions secrets.
- **Semester**: one active at a time; historical runs viewable/exportable.
- Sample inputs arrive as **CSV**; loaded into a "Test" semester.

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

- Hard: AD locks. Soft: preferences (rank + hard exclusions) + all constraints (each has an integer penalty; higher penalty ⇒ violated/relaxed later).
- Course "director" is a specific person for a course, distinct from teaching sections and does not consume a period/load by itself.

## Solver determinism invariants
1. No randomness (no `Math.random`/shuffle). Any nondeterminism is a bug.
2. Iterate periods, persons, courses in canonical sorted order — never rely on DB/insertion order.
3. Pure functions only in `src/scheduler/`: take typed input, return a result and a score. No I/O, no network.
4. Tie-breaks are by target-slack → fewest sections → preference → alphabetical. Start-period offset per course derives from a stable index.
5. `solve()` = `solveCore` (greedy; person-period + room-count capacity) → `assignRooms` (deferred room fill). A search-based solver can replace `solveCore` behind the same `SolveResult` interface later.

## Directive from scheduling guidance (Inputs/*.pdf)
Soft targets that should reduce to penalty-weighted constraints (several not yet
wired in — see outstanding.md Q6/Q7):
- All 12 times used; don't concentrate in a few periods.
- 10+ sections ⇒ ≥6 times, M/T-split with more mornings, include M1+T1; M1/M2/T1/T2 ≥ others; ≥25% of sections in 5th/6th.
- Spread a course's sections M/T and through the day unless one instructor.
- Single-period course ≥250 enrollment ⇒ all 12 times.
- Double-period courses start only at 1st/3rd/5th.
- Avoid single-offering at slots 1/5/6 (encoded: `single_offering_peak`).
- Two-section course: no back-to-back within one double block (encoded: `two_section_same_block`).

## Directory layout
```
src/
  env.ts                 # validate VITE_* at startup
  utils/supabase.ts      # supabase client
  context/AuthContext.tsx# whoami, login/logout, role
  hooks/useRbac.ts
  lib/
    rbac.ts              # role checks + labels
    periods.ts           # canonical M1..T6, lunch-aware adjacency
    supabase-tables.ts   # typed row accessors (reads)
    api.ts               # mutations guarded by role
  scheduler/
    types.ts             # input/output/solution types
    normalize.ts         # canonical ordering of inputs
    constraints.ts       # penalty evaluations
    solver.ts            # solveCore (greedy) + solve (core + rooms)
    rooms.ts             # deferred room-filling pass
    score.ts
    index.ts             # run(input) => { solution, score, violates }
    __tests__/
      solver.test.ts
      fixture.test.ts    # runs on real fall2026 fixture
      fixtures/fall2026.json  # 16 courses/116 sections/41 instructors/15 rooms
  pages/
    LoginPage.tsx
    (Roster, Courses, Qualifications, Preferences,
     Locks, Constraints, Schedule) Page.tsx
  components/
  routes.tsx / App.tsx
temp/                     # local scratch (gitignored); parse_pco.py regenerates the fixture
```

## Database schema (tables)
All input/result tables carry `semester_id` (PCO is per-semester).
- `semesters` — id, name (e.g. "Fall 2026"), start, end. One active at a time.
- `persons` — id (uuid, links auth), name, email, role (enum), label (text, nullable), course_load (int, target). One row per faculty member.
- `course_list` — id, semester_id, code (e.g. MATH 411), title, sections (int), expected_enrollment (int).
- `qualifications` — id, person_id, course_id, level (enum: `can_teach | has_taught | can_direct`). One row per level; multiple levels allowed per person+course. Modeled as instructor × course grid.
- `periods` — id, semester_id, code (M1..T6), day (enum `M|T`), slot (1..6), part_of_day (enum `morning|afternoon`). M4–M5 / T4–T5 are a LUNCH break (not consecutive).
- `classrooms` — id, semester_id, name, capacity (int; a room characteristic, currently up to 23). Seating target ≈ 110% of expected enrollment by sizing sections.
- `preferences` — id, person_id, semester_id, kind (enum `course|period`), course_id (nullable), period_id (nullable), rank (int; lower = stronger), is_hard_exclusion (bool). Faculty "want to teach X / teach during Y"; hard exclusions = hard.
- `locks` — id, semester_id, course_id, section (nullable), person_id (nullable), period_id (nullable), room_id (nullable), lock_type (enum `course_director | assignment`), note. HARD — any subset of course→section→period→room→instructor.
- `constraints` — id, semester_id, name, type (enum: `spread_sections | morning_min | afternoon_min | balance_mt | consecutive_periods | single_day | no_forced_break | single_offering_peak | two_section_same_block`), penalty (int), params (jsonb).
- `schedule_runs` — id, semester_id, created_by, created_at, status (enum `running|done|failed`), solution_hash (for reproducibility), score (int).
- `schedule_assignments` — id, run_id, person_id, course_id, section (int), period_id, room_id (nullable), role (enum `director|teacher`).

## RLS model
- Everyone (authenticated faculty) can read: `course_list`, `periods`, `classrooms`, `constraints` (final PCO view), `schedule_runs` + `schedule_assignments` (view results).
- `persons`: users read their own row; AD/lead can read full roster.
- Writes split by role:
  - faculty / new_instructor → upsert own `preferences`.
  - academic_director + lead_admin → `locks`, `constraints` (may also remove hard exclusions).
  - lead_admin → `course_list`, `qualifications`, `semesters`, `persons` (onboarding), `classrooms`.
- Use RLS policies keyed on the current user's `persons.role`. App-role checks in `lib/rbac.ts` are UX only.

## Output / export
The PCO report must be downloadable in several formats (offline save + historical view). Primary views:
1. Sections by **course** (each course → its periods/instructors/rooms).
2. Sections by **teacher** (each instructor → their periods/courses/rooms).
3. The special **PCO xlsx** layout (`Inputs/DFMS_PCO_F26_V7.xlsx`).
(Not yet implemented — see `outstanding.md` Q3.)

## Roadmap
1. Scaffold + auth — DONE.
2. Greedy-valid deterministic solver + real Fall 2026 fixture — DONE (16 courses/116 sections placed, rooms filled, no double-booking).
3. Seed input tables + CRUD pages for inputs (roster, courses, quals, preferences, locks, constraints).
4. Search-based solver to optimize soft guidance targets (penalty minimization), replacing `solveCore`.
5. Run/visualize schedule; persist results; faculty view; multi-format export module.
6. Encode remaining guidance rules (double-period, ≥250 spread, ≥25%-afternoon, M1/M2/T1/T2 density).