# HANDOFF — August 20 evening session

Status and next steps for whoever resumes this. Repo: `usafa-bsms/PCOApp`, local
`C:\Users\Harris.Butler\PCOApp` (Windows, git-bash/MSYS). The scheduling feature
is LIVE end-to-end: full CRUD input pages, a deterministic constraint-search
solver that runs in the browser, and a Schedule page that persists/view/delete
runs. Remaining work is the export module and encoding the last guidance rules.

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
    (persisted across navigation) and Delete (AD/lead).
- **Deployed**: https://usafa-bsms.github.io/PCOApp/ — GitHub Actions deploys on
  push to `main` (secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` set).

## Checks passing
- `npm test` — 15 pass (periods + solver + fixture + bench), pure, no network.
- `npm run build` — passes (tsc -b, then vite).
- `npm run lint` — 0 errors (benign react-refresh/exhaustive-deps warnings).

## NEXT SESSION
1. **Export module** (the main remaining deliverable) — course view / teacher view /
   the special **PCO xlsx** layout from `Inputs/DFMS_PCO_F26_V7.xlsx`. See
   outstanding.md Q3. Wire it into the Schedule page (export a saved run).
2. **Double-period modeling** — outstanding.md Q6: designate a course as
   double-period; if it gets a real (non-NONE) room, hold that room across both
   periods. Currently every section is single-period.
3. **Remaining guidance constraints** — outstanding.md Q6 note: ten-listing the
   other rules (≥250 spread, ≥25%-afternoon, M1/M2/T1/T2 density, distribution) is
   still pending; only `single_offering_peak` and `two_section_same_block` are
   evaluated today. Optionally tune penalty weights via the Constraints tab.
4. Optional: persist per-violation list on a run (score + assignments are saved,
   but not the violation breakdown), so past runs explain their score.

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