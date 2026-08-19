import { supabase } from '../utils/supabase'
import type { Semester, Person, Course, Qualification, QualLevel } from './db-types'
import type { Role } from './rbac'

export async function fetchSemesters(): Promise<Semester[]> {
  const { data, error } = await supabase
    .from('semesters')
    .select('*')
    .order('name')
  if (error) throw error
  return (data as Semester[]) ?? []
}

export async function createSemester(name: string): Promise<string> {
  const { data, error } = await supabase
    .from('semesters')
    .insert({ name, is_active: false })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function setActiveSemester(id: string): Promise<void> {
  const { error } = await supabase.rpc('activate_semester', { p_semester_id: id })
  if (error) throw error
}

export async function updateSemester(
  id: string,
  patch: { name?: string; starts_on?: string | null; ends_on?: string | null },
): Promise<void> {
  const { error } = await supabase.from('semesters').update(patch).eq('id', id)
  if (error) throw error
}

/** Clone roster + course load + courses (and rooms/periods/quals) into a new semester. */
export async function copySemester(sourceId: string, newName: string): Promise<string> {
  const { data, error } = await supabase.rpc('copy_semester', {
    source_semester_id: sourceId,
    new_name: newName,
  })
  if (error) throw error
  return data as string
}

export async function fetchPersons(semesterId: string): Promise<Person[]> {
  const { data, error } = await supabase
    .from('persons')
    .select('*')
    .eq('semester_id', semesterId)
    .order('name')
  if (error) throw error
  return (data as Person[]) ?? []
}

export async function addPerson(input: {
  semesterId: string
  name: string
  email: string
  role: Role
  courseLoad: number
  label?: string
}): Promise<string> {
  const { data, error } = await supabase
    .from('persons')
    .insert({
      semester_id: input.semesterId,
      name: input.name,
      email: input.email,
      role: input.role,
      course_load: input.courseLoad,
      label: input.label ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updatePerson(
  id: string,
  patch: { name?: string; email?: string; role?: Role; course_load?: number; label?: string },
): Promise<void> {
  const { error } = await supabase.from('persons').update(patch).eq('id', id)
  if (error) throw error
}

export async function deletePerson(id: string): Promise<void> {
  const { error } = await supabase.from('persons').delete().eq('id', id)
  if (error) throw error
}

export async function fetchCourses(semesterId: string): Promise<Course[]> {
  const { data, error } = await supabase
    .from('course_list')
    .select('*')
    .eq('semester_id', semesterId)
    .order('code')
  if (error) throw error
  return (data as Course[]) ?? []
}

export async function addCourse(input: {
  semesterId: string
  code: string
  title?: string
  sections: number
  expectedEnrollment: number
  isDoublePeriod?: boolean
}): Promise<string> {
  const { data, error } = await supabase
    .from('course_list')
    .insert({
      semester_id: input.semesterId,
      code: input.code,
      title: input.title ?? null,
      sections: input.sections,
      expected_enrollment: input.expectedEnrollment,
      is_double_period: input.isDoublePeriod ?? false,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updateCourse(
  id: string,
  patch: {
    code?: string
    title?: string | null
    sections?: number
    expected_enrollment?: number
    is_double_period?: boolean
  },
): Promise<void> {
  const { error } = await supabase.from('course_list').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteCourse(id: string): Promise<void> {
  const { error } = await supabase.from('course_list').delete().eq('id', id)
  if (error) throw error
}

export async function fetchQualifications(semesterId: string): Promise<Qualification[]> {
  const { data, error } = await supabase.rpc('qualifications_for_semester', { semester: semesterId })
  if (error) throw error
  return (data as Qualification[]) ?? []
}

export async function setQualification(
  personId: string,
  courseId: string,
  level: QualLevel,
  enabled: boolean,
): Promise<void> {
  if (enabled) {
    const { error } = await supabase
      .from('qualifications')
      .upsert({ person_id: personId, course_id: courseId, level }, { onConflict: 'person_id,course_id,level' })
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('qualifications')
      .delete()
      .eq('person_id', personId)
      .eq('course_id', courseId)
      .eq('level', level)
    if (error) throw error
  }
}