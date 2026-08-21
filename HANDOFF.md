# HANDOFF — ready for next session (as of Aug 21, 2026)

Status and next steps for whoever resumes this. Repo: `usafa-bsms/PCOApp`, local
`C:\Users\Harris.Butler\PCOApp` (Windows, git-bash/MSYS). Everything is committed
and pushed to `main` (GitHub Pages auto-deploys on push). The export module,
double-period modeling, and the course-load fix are all shipped and tested.

## Shipped this cycle
1. **Export module (Q3)** — CSV-by-course, CSV-by-teacher, and the special PCO
   xlsx layout, on any shown run (latest or saved). `src/lib/export.ts` (pure,
   tested) + lazy `src/lib/export-ui.tsx`; SheetJS code-split to a 286KB chunk
   loaded on first export click. Tests: `export.test.ts` (7).
2. **Double-period solver modeling (Q6)** — adjacency corrected (lunch between
   M4/M5 and T4/T5, was M3/M4); a double course (Courses tab `is_double_period`)
   is placed as a 2-slot block at the 1st/3rd/5th slot with both periods reserved
   for one person, and `assignRooms` holds ONE real room across both. Implemented
   in `cspSolve` + greedy `solveCore`. Tests: `double-period.test.ts` (5).
3. **Course-load target fix (off-by-one)** — the CP solver previously ignored
   `courseLoad`, causing load+1 schedules. Added `load_target` (penalty 20, seeded
   default) wired into the CP incremental cost AND `evaluateConstraints` (now takes
   `persons`). On the fixture every instructor now lands EXACTLY on their load.
   Regression test in `solver.test.ts`.

## NEXT SESSION
1. **Remaining guidance constraints** (outstanding.md Q6 note): ≥250-spread,
   ≥25%-afternoon, M1/M2/T1/T2 density, distribution are still unevaluated; only
   `single_offering_peak` and `two_section_same_block` are wired today. This is
   the last solver item.
2. Optional: persist the per-violation list on a run (score + assignments are
   saved, but not the violation breakdown), so past runs explain their score.
3. Before anything else, **re-run the schedule** in the Schedule tab (existing
   `Fall 2026` runs predate the load fix and show the old distribution).

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