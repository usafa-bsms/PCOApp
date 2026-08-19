-- Robust role resolution + atomic semester activation.
--
-- current_user_role() previously required an ACTIVE semester. With no active
-- semester (or one lacking the user's persona), the user was treated as having
-- no role, which RLS interpreted as lost privileges:
--   - reads returned empty (an apparent "wiped roster"), and
--   - writes (create semester, activate) were blocked.
-- The old activate path deactivated the current semester before activating the
-- target (two separate statements), opening a window with zero active semesters,
-- so current_user_role() returned null mid-activation and the second UPDATE was
-- rejected by RLS -- activation never completed and the system was left with no
-- active semester.
--
-- Fix: fall back to ANY persona linked to the user (preferring the active
-- semester when one exists), and make activation a single atomic function.

create or replace function public.current_user_role() returns public.role
language sql stable security definer set search_path = public
as $$
  select p.role
  from public.persons p
  join public.semesters s on s.id = p.semester_id
  where p.auth_user_id = auth.uid()
  order by s.is_active desc   -- prefer the active semester, else any persona
  limit 1;
$$;

create or replace function public.activate_semester(p_semester_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.current_user_role() not in ('academic_director', 'lead_admin') then
    raise exception 'only academic directors / lead admins may activate a semester';
  end if;
  update public.semesters set is_active = false where is_active = true;
  update public.semesters set is_active = true where id = p_semester_id;
  if not found then
    raise exception 'semester % not found', p_semester_id;
  end if;
end;
$$;

grant execute on function public.activate_semester(uuid) to authenticated;