# AGENTS.md

## Overview
PCOApp builds a "Preferred Course Offering" (PCO) schedule for a USAFA Mathematical Sciences Dept (BSMS) semester: which instructor teaches which course section in which period, optimizing instructor preferences around constraint penalties and hard "locked" choices.

- **Stack**: Vite + React + TypeScript, Supabase (Postgres + Auth + RLS).
- **Repo**: `usafa-bsms/PCOApp` (GitHub), hosted on GitHub Pages.
- **Auth**: Supabase email/password. Login maps to a `persons` row with a `role`.
- **Scheduling runs CLIENT-SIDE in the browser and is DETERMINISTIC**: same inputs produce the same result on any machine. This is a hard invariant, so the solver must avoid randomness/ordering-by-insertion. Results are persisted to the DB for faculty to view.
- Host OS is Windows; shell is bash (git-bash / MSYS).

## Developer commands
```
npm install          # install deps
npm run dev          # local Vite dev server
npm run build        # type-check + build (tsc -b && vite build)
npm test             # vitest (run solver unit tests)
npm run lint         # eslint
```
Order matters: `npm run build` runs `tsc -b` first, so it also type-checks. Run `npm test` and `npm run build` before pushing.

## Environment config
- READ by Vite at build time via `import.meta.env` — `VITE_` prefix required.
- Local creds live in `.env` (gitignored); see `.env.example` for shape. NEVER commit `.env` or the source values.
- `src/env.ts` validates `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` at startup. The publishable key is safe to embed (baked into the static Pages build). The service-role key must NEVER be used client-side.
- GitHub Pages workflow (`deploy.yml`) injects these via GitHub Actions secrets.

## Architecture (see docs/ARCHITECTURE.md for detail)
- `src/scheduler/` — deterministic constraint-satisfaction solver (pure, side-effect-free, unit-tested). Preserve determinism: no randomness, sort/iterate inputs canonically. `solve()` = `solveCore` (greedy, person-period + room-count capacity) then `assignRooms` (keep instructor's room unless a schedule break). Modular by design: a search-based solver can replace `solveCore` behind the same `SolveResult` interface.
- Real Fall 2026 dataset lives at `src/scheduler/__tests__/fixtures/fall2026.json` (16 courses, 116 sections, 41 instructors, 15 rooms, ground truth). Regenerate with `temp/parse_pco.py` from `Inputs/*.xlsx`. Keep this fixture hermetic; do not make tests require live Supabase.
- `src/lib/rbac.ts` — role checks. Roles: `faculty`, `new_instructor`, `academic_director`, `lead_admin`. A `persons.label` free-text tag exists alongside role for auxiliary attributes (advisor, dept head, affiliate), NOT for authorization.
- `src/lib/periods.ts` — canonical M1–M6, T1–T6 with day(M/T), slot, part-of-day, and lunch-aware adjacency (`areConsecutivePeriods`).
- `supabase/migrations/*.sql` — schema + RLS. RLS is the enforcement layer; app role checks are UX only. Never trust client-side role checks.
- Pages under `src/pages/`, data access in `src/lib/`.

## Key domain rules
- 12 periods, 12 slots, named **M1–M6 / T1–T6**. **LUNCH BREAK between M4 and M5** (and T4/T5): those are NOT consecutive — a teacher on M4+M5 has a break. `src/lib/periods.ts` encodes adjacency for this.
- **Course load is a per-person TARGET** (default 3; `new_instructor` default 4), reduced manually for extra responsibilities (pilot, double-prep, etc.). It is a soft goal, not a hard cap. Manual input always wins.
- Roles: `faculty`, `new_instructor`, `academic_director`, `lead_admin`. `persons.label` is a free-text tag (advisor, dept head, affiliate) for context only — NOT authorization.
- **Locks are HARD and may pin any subset of course→section→period→room→instructor.** Person/period/room are each optional; solver keeps what's locked and fills the rest. A **course director is a course-level role** and does NOT by itself consume a teaching period or count toward load (directors may still teach separately — e.g. Math 243/253).
- **Faculty preferences** = weighted points (lower `rank` = stronger) plus **hard exclusions** ("will not teach X" / "cannot teach Y"). Exclusions are hard; ADs may remove them.
- Everything else is a **soft constraint**, each with an integer penalty (higher = relaxed/violated later). Known types: spread_sections, morning_min, afternoon_min, balance_mt, consecutive_periods, single_day (all-M or all-T), no_forced_break, single_offering_peak, two_section_same_block.
- **Schedule model**: many sections run concurrently per period, bounded by room count (a per-period concurrency cap) and one class per instructor per period. Rooms are deferred to a final pass (`assignRooms`) that keeps an instructor in one room unless there's a schedule break.
- Section counts are **manual input**; the ~10%-seats rule is a manual planning heuristic, not auto-sizing. Section numbering is fixed; locks bind lowest-numbered sections first.
- A PCO is scoped to a **semester**; all input tables carry `semester_id`. One active semester at a time; historical runs remain viewable/exportable.
- Sample inputs (xlsx) live under `Inputs/`; see `outstanding.md` for the latest questions/status (Q1–Q8).

## Gotchas
- `gh api /...` in git-bash rewrites leading-slash paths (`/user` → `C:/.../Git/user`). Prefix with `MSYS_NO_PATHCONV=1`.
- Tests: nothing requires a live Supabase yet; solver tests are pure. Do not add tests that need network credentials.