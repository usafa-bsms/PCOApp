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
- `src/scheduler/` — deterministic constraint-satisfaction solver (pure, side-effect-free, unit-tested). Preserve determinism: no randomness, sort/iterate inputs canonically.
- `src/lib/rbac.ts` — role checks. Roles: `faculty`, `academic_director`, `lead_admin`. A `persons.label` free-text tag exists alongside role for auxiliary attributes (advisor, dept head, affiliate), NOT for authorization.
- `src/lib/periods.ts` — canonical M1–M6, T1–T6 with day(M/T) and part-of-day flags for constraints.
- `supabase/migrations/*.sql` — schema + RLS. RLS is the enforcement layer; app role checks are UX only. Never trust client-side role checks.
- Pages under `src/pages/`, data access in `src/lib/`.

## Key domain rules
- 12 periods, 12 slots, named **M1–M6 / T1–T6**. Classrooms currently seat 23 but capacity is just data.
- AD "locks" (assign a course director, force a course→period→instructor) are HARD; solver routes around them.
- Everything else is a soft constraint, each with an integer penalty (higher = less likely to be violated; violated constraints are the ones relaxed first).
- A PCO is scoped to a **semester**; all input tables carry a `semester_id`.

## Gotchas
- `gh api /...` in git-bash rewrites leading-slash paths (`/user` → `C:/.../Git/user`). Prefix with `MSYS_NO_PATHCONV=1`.
- Tests: nothing requires a live Supabase yet; solver tests are pure. Do not add tests that need network credentials.