-- Helper to read a semester's qualifications efficiently (join through persons).

create or replace function public.qualifications_for_semester(semester uuid)
returns table (id uuid, person_id uuid, course_id uuid, level public.qual_level)
language sql stable security invoker set search_path = public
as $$
  select q.id, q.person_id, q.course_id, q.level
  from public.qualifications q
  join public.persons p on p.id = q.person_id
  where p.semester_id = semester
$$;

grant execute on function public.qualifications_for_semester(uuid) to authenticated;