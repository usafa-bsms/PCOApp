# HANDOFF — August 19 evening session

Status and next steps for whoever resumes this. Repo: `usafa-bsms/PCOApp`,
local `C:\Users\Harris.Butler\PCOApp` (Windows, git-bash/MSYS). Current work: the
CRUD foundation is complete and tested; next is wiring the scheduler/solver +
preferences/locks/constraints into the app.

## Current state (verified)
- **Live Supabase** (`lqvebfpshohqchympzby.supabase.co`, `us-east-2`): migrated
  + seeded, `fall2026` fixture present. `Fall 2026` is the active semester (16
  courses, 41 instructors, 15 rooms, 12 periods, quals populated). A
  `Fall 2026 (copy)` semester also exists (created during testing) — both
  rosters intact.
- **Auth**: `harris.butler@afacademy.af.edu` / academic_director account exists,
  email confirmed, linked to the persona in both semesters. Temp password
  `7da5eb579fc6` (in `temp/credentials.md`) — **must be changed** in Supabase Auth.
- **Schema** (`supabase/migrations/0001..0005`, all applied live):
  - Per-semester roster; `copy_semester(uuid,text)` and
    **`activate_semester(uuid)`** security-definer RPCs (AD/lead guarded).
  - `current_user_role()` (*patched in `0005`*) returns role from ANY linked
    persona, preferring the active semester — so losing the active semester no
    longer wipes privileges / hides the roster.
  - RLS: AD/lead write persons, courses, quals, semesters.
- **UI shipped** (routes: Home, Semesters, Roster, Courses, Qualifications).
  Preferences/Locks/Constraints/Schedule are placeholders:
  - Semesters: create empty, Activate, edit name, carry forward.
  - Roster/Courses: list, add, remove, **per-row Edit** (Save/Cancel).
  - Qualifications: editable grid, saved per-checkbox.
  - CRUD add/edit updates the table in place (helpers return the record id).
- **Deployed**: https://usafa-bsms.github.io/PCOApp/ — GitHub Actions deploys on
  push to `main` (secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` set).

## Checks passing
- `npm test` — 13 pass (periods + solver + fixture), pure, no network.
- `npm run build` — passes (tsc -b, then vite).
- `npm run lint` — 0 errors (benign react-refresh/exhaustive-deps warnings).

## NEXT SESSION — build the scheduling feature (NOT yet wired)
The deterministic solver already EXISTS under `src/scheduler/` (pure,
unit-tested): `solve()` = `solveCore` (greedy, person-period + room-count cap)
then `assignRooms` (keep instructor's room unless a schedule break) —
`src/scheduler/{solver,rooms,constraints,normalize,types}.ts`, exported from
`src/scheduler/index.ts` (`solve`, `evaluateConstraints`, `normalizeInput`).
It is only missing the UI + DB wiring. Suggested order:

1. **Preferences**, **Locks**, **Constraints** pages (currently placeholders in
   `src/pages/pages.tsx` → `placeholder()`). Schema already has tables
   `preferences`, `locks`, `constraints` (input tables with `semester_id`). Build
   CRUD + api.ts helpers mirroring the Roster/Courses pattern. Remember the
   AD's external hard exclusions are only removable by AD.
   - `constraints` model: read-only list of soft constraints with penalty? Or
     AD-editable; decide what `constraints` page should manage (the types are
     in `0001`; see `outstanding.md` for the guidance rules to encode).
2. **Schedule page**: run `solve()` client-side on the active semester's inputs
   (normalize → solve → assignRooms → optionally `evaluateConstraints`), persist
   the result to `schedule_runs` + `schedule_assignments`, and view/export it.
   - Exports (course view / teacher view / xlsx) are a separate module — still to
     build (see `src/scheduler/` for model names; `docs/ARCHITECTURE.md`).
   - Determinism is a HARD invariant; feed inputs canonically (no randomness).
3. After the solver is wired and demonstrated, deliver the **export module**
   (course view / teacher view / xlsx). See `outstanding.md` (Q1–Q8) for the
   remaining evaluator rules: double-period start, ≥250 all-times seats,
   25%-afternoon, M1/M2/T1/T2 peak density.

## Gotchas / environment notes
- Supabase creds + DB password live only in `supabase-connect-instructions.txt`,
  `supabase-password.txt`, and `temp/credentials.md` (all gitignored).
- `gh` is authed as `parsimo2010`; use `MSYS_NO_PATHCONV=1` for `gh api /...`.
- pg driver for direct-DB scripts in
  `C:\Users\HARRIS~1.BUT\AppData\Local\Temp\opencode\db\node_modules` (scratch).
  Pooler: `aws-0-us-east-2.pooler.supabase.com:6543`, user `postgres.<ref>`,
  ssl required. **Migrations are applied manually** to the live DB — no CI runner.
- `Fall 2026 (copy)` is leftover from testing; it's inert (not active). Can be
  deleted or renamed.