# HANDOFF — August 18 evening session

Status and next steps for whoever resumes this. Repo: `usafa-bsms/PCOApp`,
local `C:\Users\Harris.Butler\PCOApp` (Windows, git-bash/MSYS).

## Goal for the user
Test-drive the deployed app: log in as `harris.butler@afacademy.af.edu`
(academic_director), carry a semester forward, add/remove instructors and
courses, and edit qualifications.

## What is DONE and verified
- **Live Supabase** (`lqvebfpshohqchympzby.supabase.co`, region `us-east-2`):
  migrated + seeded. `Fall 2026` is the active semester (16 courses, 41
  instructors, 15 rooms, 12 periods, quals populated).
- **Schema** (`supabase/migrations/0001..0004`, all applied live):
  - Roster is **per-semester** (`persons.semester_id`, `auth_user_id` login
    link, `unique(semester_id, email)`).
  - `course_list.is_double_period`; `classrooms.assignable` for NONE-rooms.
  - `copy_semester(source_id, name)` RPC clones roster + course load + courses
    (plus rooms/periods/quals). AD/lead only (security-definer guarded).
  - `current_user_role()` + `qualifications_for_semester()` helpers.
  - RLS: AD/lead can write persons, courses, quals, semesters.
- **UI** built and shipped (routes: Home, Semesters, Roster, Courses,
  Qualifications; Preferences/Locks/Constraints/Schedule remain placeholders):
  - Semesters: create empty, activate, **carry forward**.
  - Roster: list, add, remove, edit role + course load.
  - Courses: list, add, remove (incl. double-period flag).
  - Qualifications: editable grid (can_teach / has_taught / can_direct), saved
    per-checkbox.
  - `SemesterContext` (active-semester provider), `AuthContext` now matches
    personas via `auth_user_id`.
- **Deployed**: GitHub Pages live at **https://usafa-bsms.github.io/PCOApp/**
  (build_type "workflow"; repo secrets `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` are set). Deploy runs on push to `main`.
- **Smoke test**: with a throwaway AD account I verified end-to-end via REST —
  sign-in, read semesters/persons/courses/quals, `copy_semester`, add/delete
  person, add/set-qualification/delete course, current_user_role. All pass.
  (That throwaway account was removed afterward.)

## What is NOT done (blocked / left for next session)
1. **Create the `harris.butler@afacademy.af.edu` login.** Supabase's *signup*
   endpoint (the ONLY reliable path — see "Login gotcha" below) is currently
   **rate-limited** (429) from repeated attempts; let it cool (overnight should
   be enough). Everything is staged: the AD persona `Butler, Harris` exists in
   the active semester (currently unlinked), and credentials are in
   `temp/credentials.md`.

### Login gotcha (critical)
Supabase rejects logins for auth users **hand-inserted into `auth.users` by
SQL** with `Database error querying schema` (GoTrue only trusts users created
by its own flow). The ONLY working approach verified:
   1. `POST /auth/v1/signup` with `{email, password}` (via `@supabase` client or
      curl with the publishable key).
   2. Set `email_confirmed_at = now()` on the resulting `auth.users` row.
   3. Link the pre-made persona: `update public.persons set auth_user_id = '<uid>'
      where email = 'harris.butler@afacademy.af.edu'`.
   4. Sign in and confirm role reads via `current_user_role()`.
   (Also note: `auth.identities.email` is a generated column; and
   `persons.auth_user_id` is `on delete cascade` — deleting an auth user deletes
   its linked persona, which is how we lost the first Butler persona. Recreated.)

### Steps to finish tomorrow
1. Wait out the signup rate limit, then `signup` harris:
   `curl -X POST https://lqvebfpshohqchympzby.supabase.co/auth/v1/signup -H "apikey: $KEY" -H "Content-Type: application/json" -d '{"email":"harris.butler@afacademy.af.edu","password":"7da5eb579fc6"}'`
   (`$KEY` in `temp/credentials.md`).
2. Connect to the DB (pooler, `temp/credentials.md`) and run:
   `update auth.users set email_confirmed_at=now() where email='harris.butler@afacademy.af.edu';`
   `update public.persons set auth_user_id=(select id from auth.users where email='harris.butler@afacademy.af.edu') where email='harris.butler@afacademy.af.edu';`
3. Give the user the URL + temp password (`7da5eb579fc6`); remind them to change
   it in Supabase Auth later.

## Gotchas / environment notes
- Repo secrets are set; local `.env` already exists (gitignored) with the
  publishable key. Supabase credentials + DB password live only in
  `supabase-connect-instructions.txt`, `supabase-password.txt`, and
  `temp/credentials.md` — all gitignored.
- `gh` is authed as `parsimo2010`; use `MSYS_NO_PATHCONV=1` for `gh api /...`.
- pg driver for direct-DB scripts is in
  `C:\Users\HARRIS~1.BUT\AppData\Local\Temp\opencode\db\node_modules` (scratch).
  The pooler is `aws-0-us-east-2.pooler.supabase.com:6543`, user
  `postgres.<ref>`, ssl required.
- Commands: `npm test` (13 pass), `npm run build` (passes), `npm run lint`
  (0 errors, benign react-refresh/exhaustive-deps warnings only).

## Remaining roadmap (not started)
- Preferences, Locks, Constraints, Schedule pages (placeholders today).
- Wire the solver into a Schedule page (run + persist + view), and the export
  module (course view / teacher view / xlsx).
- Encode remaining guidance rules into the evaluator (double-period start,
  ≥250 all-times, 25%-afternoon, M1/M2/T1/T2 density) — see `outstanding.md`.