# HANDOFF — August 21 session

Status and next steps for whoever resumes this. Repo: `usafa-bsms/PCOApp`, local
`C:\Users\Harris.Butler\PCOApp` (Windows, git-bash/MSYS). The scheduling feature
is LIVE end-to-end and the **export module is now shipped** (Q3). Remaining work
is the double-period solver modeling and the remaining guidance constraints.

## NEW in this session
- **Export module (Q3 DONE)**: `src/lib/export.ts` (pure, tested) + a lazy
  `src/lib/export-ui.tsx` (`ExportButtons`). The Schedule page exports any shown
  run (latest or saved) as:
  1. **CSV · by course** (`buildCourseView`)
  2. **CSV · by teacher** (`buildTeacherView`)
  3. **PCO xlsx** (`buildPcoRows`) — the special layout from
     `Inputs/DFMS_PCO_F26_V7.xlsx` (Dept / Course / Section Cap / Class-Section
     letter / Associated Class / Room / Select Pattern / Start Time / M-or-T /
     Instructor / Exam Type).
  - `buildPcoRows` assigns distinct period letters (M1A, T3B…) to concurrent
    sections, reads `is_double_period` for the Select Pattern, and renders rooms
    missing from the map as `NONE`. Section caps are estimated from a course's
    expected enrollment (the DB only stores course-level), overridable via `capFor`.
  - Code-split: xlsx (SheetJS) is a 286KB chunk loaded on first export click, so
    the main bundle stays ~438KB. Dependency `xlsx@^0.18.5` added.
  - Tests: `src/lib/__tests__/export.test.ts` (7).

## NEXT SESSION
1. **Double-period solver modeling** (outstanding.md Q6): the CP solver must start
   a double-period course only at 1st/3rd/5th slot and hold a real (non-NONE) room
   across both periods. The **export already honors the flag**; only the solver is
   still single-period.
2. **Remaining guidance constraints** (outstanding.md Q6 note): ≥250-spread,
   ≥25%-afternoon, M1/M2/T1/T2 density, distribution are still unevaluated; only
   `single_offering_peak` and `two_section_same_block` are wired today.
3. Optional: persist the per-violation list on a run (score + assignments are
   saved, but not the violation breakdown), so past runs explain their score.

## Current state (verified)
- **Live Supabase** (`lqvebfpshohqchympzby.supabase.co`, `us-east-2`): migrated
  through **0007**, seeded, `fall2026` fixture present. `Fall 2026` is the active
  semester (16 courses, 116 sections, 41 instructors, 15 rooms, 12 periods, quals
  populated). A `Fall 2026 (copy)` semester also exists (from earlier testing) —
  inert, not active.
- **Auth**: `harris.butler@afacademy.af.edu` / academic_director, email confirmed,
  linked in both semesters. Temp password `7da5eb579fc6` (in `temp/credentials.md`)
  — **must be changed** in Supabase Auth.
- **Schema** (migrations `0001..0007`, all applied live; applied manually via the
  pg pooler — there is no CI migration runner):
  - `1000`-less versioned: `0001_init`, `0002_ad_roster_write`,
    `0003_qualifications_helper`, `0004_fix_copy_semester`,
    `0005_role_activation_fix`, `0006_ad_preferences`, `0007_delete_schedule_runs`.
  - `current_user_role()` (*patched in `0005`*) returns role from ANY linked
    persona, preferring the active semester — RLS never silently empties on a
    missing active semester.
  - RLS: AD/lead write persons/courses/quals/semesters/periods/classrooms
    (`0002`), AD+lead write preferences (`0006`), AD/lead insert runs + delete
    schedule_runs (`0007`, assignments cascade). Constraints/locks write via the
    `admin write` policies from `0001`.
- **Solver** (`src/scheduler/`): `solve()` = `normalizeInput` → `cspSolve`
  (branch-and-bound CP, MRV+LCV, in `search.ts`; greedy `solveCore` is the
  completeness fallback when `unassigned > 0`) → `assignRooms` → `evaluateConstraints`.
  Deterministic. Measured on the fixture: CP ~252 score / 21 violations vs greedy
  ~4542 / 98 (default penalties), ~0.9–1.1s per solve.
- **UI shipped** (routes: Home, Semesters, Roster, Courses, Qualifications,
  Preferences, Locks, Constraints, **Rooms**, Schedule). All CRUD add/edit update
  the table in place (helpers return the record id — see AGENTS.md gotcha).
  - Preferences (role-aware: faculty own, AD sees all), Locks, Constraints
    (AD-editable penalties, auto-seeds 9 defaults via pure `CONSTRAINT_DEFAULTS`).
  - **Rooms**: name/capacity/assignable CRUD. `assignable=false` is a "NONE"-style
    placeholder the solver never places — supports outstanding.md Q6.
  - **Schedule**: run solve() client-side, save run+assignments, score/violations
    table (human-readable name `humanize()`), **Saved runs** list with View
    (persisted across navigation), Delete (AD/lead), and **export** of any shown run.
- **Deployed**: https://usafa-bsms.github.io/PCOApp/ — GitHub Actions deploys on
  push to `main` (secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` set).

## Checks passing
- `npm test` — 22 pass (periods + export + solver + fixture + bench), pure, no network.
- `npm run build` — passes (tsc -b, then vite).
- `npm run lint` — 0 errors (benign react-refresh/exhaustive-deps warnings).

## Gotchas / environment notes
- Supabase creds + DB password live only in `supabase-connect-instructions.txt`,
  `supabase-password.txt`, and `temp/credentials.md` (all gitignored). NEVER commit.
- `gh` is authed as `parsimo2010`; use `MSYS_NO_PATHCONV=1` for `gh api /...`.
- pg driver for direct-DB scripts in
  `C:\Users\HARRIS~1.BUT\AppData\Local\Temp\opencode\db\node_modules` (scratch).
  Pooler: `aws-0-us-east-2.pooler.supabase.com:6543`, user `postgres.<ref>`,
  ssl required. **Migrations are applied manually** to the live DB — after editing
  a migration SQL file, also run it against the DB (see the `apply0007.js` pattern).
- **Login gotcha**: create new auth users via `POST /auth/v1/signup` (postgrest
  rejects hand-inserted `auth.users`), then set `email_confirmed_at=now()` and link
  `persons.auth_user_id` by email.
- `Fall 2026 (copy)` is leftover from testing; inert. Can be deleted or renamed.