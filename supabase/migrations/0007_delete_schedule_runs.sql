-- Let AD/lead admins delete schedule runs (and, by ON DELETE CASCADE, their
-- assignments). schedule_runs previously had only read + insert policies, so
-- deleting a discarded run failed RLS. Delete is intentionally AD/lead-only;
-- faculty can continue to read published runs.

create policy "ad delete schedule_runs" on public.schedule_runs
  for delete to authenticated using (
    public.current_user_role() in ('academic_director', 'lead_admin')
  );