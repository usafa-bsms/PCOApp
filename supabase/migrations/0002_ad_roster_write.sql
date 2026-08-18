-- Allow academic directors to add/remove roster members and create semesters,
-- so an AD can carry a semester forward and adjust the roster/courses directly.
-- (Original 0001 restricted persons/`semesters` inserts to lead_admin.)

create policy "ad insert persons" on public.persons
  for insert to authenticated with check (
    public.current_user_role() in ('academic_director', 'lead_admin')
  );
create policy "ad insert semesters" on public.semesters
  for insert to authenticated with check (
    public.current_user_role() in ('academic_director', 'lead_admin')
  );
create policy "ad delete semesters" on public.semesters
  for delete to authenticated using (
    public.current_user_role() in ('academic_director', 'lead_admin')
  );