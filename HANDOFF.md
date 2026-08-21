# HANDOFF — August 21 afternoon session

Status and next steps for whoever resumes this. Repo: `usafa-bsms/PCOApp`, local
`C:\Users\Harris.Butler\PCOApp` (Windows, git-bash/MSYS). The export module is
shipped and the **double-period solver modeling is now done**. Remaining work is
the last guidance constraints (and optional per-violation persistence).

## NEW in this session
- **Course-load target fixed (off-by-one)**: the CP solver previously IGNORED
  `courseLoad` (it only sorted candidates in the greedy fallback), so schedules
  gave some instructors load+1 sections and others 0. Added a soft `load_target`
  constraint (penalty 20, seeded default) wired into BOTH the CP incremental cost
  (`search.ts` personContrib/apply) and `evaluateConstraints` (now takes
  `persons`). On the fixture every instructor now lands EXACTLY on their load
  (0 over / 0 under). Regression test in `solver.test.ts`.
- **Double-period solver modeling (Q6 DONE)**:
  - `src/lib/periods.ts` lunch-break adjacency CORRECTED: the break is between
    M4/M5 and T4/T5 (matches reference start times T4=1030/T5=1330), not between
    M3/M4. Valid double blocks are now exactly (1,2), (3,4), (5,6).
  - Solver `Course` gained `isDoublePeriod`; `cspSolve` and greedy `solveCore`
    place a double course as a 2-slot block at 1st/3rd/5th slot, both periods
    reserved for one person. `assignRooms` holds ONE room across both block
    periods. Built end-to-end via `buildSolveInput`. Tests:
    `double-period.test.ts` (5).

## NEXT SESSION
1. **Remaining guidance constraints** (outstanding.md Q6 note): ≥250-spread,
   ≥25%-afternoon, M1/M2/T1/T2 density, distribution are still unevaluated; only
   `single_offering_peak` and `two_section_same_block` are wired today. This is
   the last solver item.
2. Optional: persist the per-violation list on a run (score + assignments are
   saved, but not the violation breakdown), so past runs explain their score.

## Earlier state (mostly unchanged, still true)
- **Live Supabase** (`lqvebfpshohqchympzby.supabase.co`, `us-east-2`): migrated
  through **0007**, seeded, `fall2026` fixture present. `Fall 2026` is the active
  semester (16 courses, 116 sections, 41 instructors, 15 rooms, 12 periods, quals
  populated). `Fall 2026 (copy)` leftover is inert.
- **Auth**: `harris.butler@afacademy.af.edu` / academic_director. Temp password
  `7da5eb579fc6` (in `temp/credentials.md`) — **must be changed**.
- **Schema** (migrations `0001..0007`, all applied live, manually via pg pooler).
- **Solver** (`src/scheduler/`): `solve()` = `normalizeInput` → `cspSolve`
  (branch-and-bound CP, MRV+LCV, `search.ts`; greedy `solveCore` fallback) →
  `assignRooms` → `evaluateConstraints`, all deterministic. Now double-period aware.
- **UI / export**: Schedule page persists/view/deletes runs and exports any shown
  run (CSV-by-course, CSV-by-teacher, PCO xlsx via lazy-loaded `src/lib/export.ts`).
- **Deployed**: https://usafa-bsms.github.io/PCOApp/ on push to `main`.

## Checks passing
- `npm test` — 30 pass (periods + export + solver + double-period + fixture + bench).
- `npm run build`, `npm run lint` — pass (0 errors).

## Note for the live DB
- The existing `Fall 2026` schedule runs were saved BEFORE the `load_target` fix,
  so they still show the old load+1 distribution. After this deploys, **re-run the
  schedule** in the Schedule tab to see every instructor land exactly on their load.

## Gotchas / environment notes
- Supabase creds + DB password live only in `supabase-connect-instructions.txt`,
  `supabase-password.txt`, and `temp/credentials.md` (all gitignored). NEVER commit.
- `gh` is authed as `parsimo2010`; use `MSYS_NO_PATHCONV=1` for `gh api /...`.
- pg driver for direct-DB scripts in
  `C:\Users\HARRIS~1.BUT\AppData\Local\Temp\opencode\db\node_modules` (scratch).
  Pooler: `aws-0-us-east-2.pooler.supabase.com:6543`, user `postgres.<ref>`,
  ssl required. **Migrations are applied manually** to the live DB.
- **Login gotcha**: create new auth users via `POST /auth/v1/signup`, then set
  `email_confirmed_at=now()` and link `persons.auth_user_id` by email.
- `Fall 2026 (copy)` is leftover from testing; inert. Can be deleted or renamed.