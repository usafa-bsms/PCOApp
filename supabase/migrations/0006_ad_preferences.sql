-- AD / lead-admin read+write over ALL roster preferences (clearing hard
-- exclusions is an AD action). The 0001 policy only let a person edit their own
-- active-semester preferences; an AD could not view faculty preferences or
-- remove a faculty "will not teach / cannot teach Y" hard exclusion.
--
-- Permit-policies combine with OR, so ADDING an AD policy alongside the existing
-- "own preferences" policy keeps each person able to manage their own rows while
-- granting AD/lead full read+write over the roster's preferences.

create policy "ad preferences" on public.preferences
  for all to authenticated using (
    public.current_user_role() in ('academic_director', 'lead_admin')
  ) with check (
    public.current_user_role() in ('academic_director', 'lead_admin')
  );