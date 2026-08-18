-- Fix copy_semester: the original used set_config() with UUID- and dot-bearing
-- keys, which is an invalid GUC parameter name. Rewrite to remap qualifications
-- through natural keys (email for persons, code for courses) within the new
-- semester instead of an in-memory id map.

create or replace function public.copy_semester(
  source_semester_id uuid,
  new_name text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  new_sem_id uuid;
  src_course public.course_list%rowtype;
  src_person public.persons%rowtype;
  src_class public.classrooms%rowtype;
  src_period public.periods%rowtype;
begin
  if public.current_user_role() not in ('academic_director', 'lead_admin') then
    raise exception 'only academic directors / lead admins may copy a semester';
  end if;

  insert into public.semesters (name, starts_on, ends_on, is_active)
  select new_name, starts_on, ends_on, false
  from public.semesters where id = source_semester_id
  returning id into new_sem_id;
  if new_sem_id is null then
    raise exception 'source semester % not found', source_semester_id;
  end if;

  -- courses (codes are unique within a semester, so no id remap needed)
  for src_course in select * from public.course_list
    where semester_id = source_semester_id order by code
  loop
    insert into public.course_list
      (semester_id, code, title, sections, expected_enrollment, is_double_period)
    values (new_sem_id, src_course.code, src_course.title, src_course.sections,
            src_course.expected_enrollment, src_course.is_double_period);
  end loop;

  -- persons (email is unique within a semester; login link preserved by email)
  for src_person in select * from public.persons
    where semester_id = source_semester_id order by email
  loop
    insert into public.persons
      (semester_id, name, email, role, label, course_load, auth_user_id)
    values (new_sem_id, src_person.name, src_person.email, src_person.role,
            src_person.label, src_person.course_load, src_person.auth_user_id);
  end loop;

  -- classrooms (incl. NONE/unassignable rooms)
  for src_class in select * from public.classrooms
    where semester_id = source_semester_id order by name
  loop
    insert into public.classrooms (semester_id, name, capacity, assignable)
    values (new_sem_id, src_class.name, src_class.capacity, src_class.assignable);
  end loop;

  -- periods
  for src_period in select * from public.periods
    where semester_id = source_semester_id order by code
  loop
    insert into public.periods (semester_id, code, day, slot, part_of_day)
    values (new_sem_id, src_period.code, src_period.day, src_period.slot, src_period.part_of_day);
  end loop;

  -- qualifications, remapped by natural keys
  insert into public.qualifications (person_id, course_id, level)
  select np.id, nc.id, q.level
  from public.qualifications q
  join public.persons sp on sp.id = q.person_id
  join public.course_list sc on sc.id = q.course_id
  join public.persons np on np.semester_id = new_sem_id and np.email = sp.email
  join public.course_list nc on nc.semester_id = new_sem_id and nc.code = sc.code
  where sp.semester_id = source_semester_id
    and sc.semester_id = source_semester_id;

  return new_sem_id;
end;
$$;