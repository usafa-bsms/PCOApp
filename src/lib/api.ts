import { supabase } from '../utils/supabase'
import type {
  Semester,
  Person,
  Course,
  Qualification,
  QualLevel,
  DbPeriod,
  Preference,
  Lock,
  Constraint,
  ConstraintType,
  Classroom,
  RunStatus,
  ScheduleRun,
  ScheduleAssignment,
} from './db-types'
import type { Role } from './rbac'
import { CONSTRAINT_DEFAULTS } from './constraintDefaults'

export { CONSTRAINT_DEFAULTS }

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
): Promise<string> {
  const { data, error } = await supabase
    .from('semesters')
    .update(patch)
    .eq('id', id)
    .select('id')
    .single()
  if (error) throw error
  return data.id
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
): Promise<string> {
  const { data, error } = await supabase
    .from('persons')
    .update(patch)
    .eq('id', id)
    .select('id')
    .single()
  if (error) throw error
  return data.id
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
): Promise<string> {
  const { data, error } = await supabase
    .from('course_list')
    .update(patch)
    .eq('id', id)
    .select('id')
    .single()
  if (error) throw error
  return data.id
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

export async function fetchPeriods(semesterId: string): Promise<DbPeriod[]> {
  const { data, error } = await supabase
    .from('periods')
    .select('*')
    .eq('semester_id', semesterId)
    .order('day')
    .order('slot')
  if (error) throw error
  return (data as DbPeriod[]) ?? []
}

export async function fetchPreferences(semesterId: string): Promise<Preference[]> {
  const { data, error } = await supabase
    .from('preferences')
    .select('*')
    .eq('semester_id', semesterId)
  if (error) throw error
  return (data as Preference[]) ?? []
}

export async function addPreference(input: {
  personId: string
  semesterId: string
  kind: 'course' | 'period'
  courseId?: string | null
  periodId?: string | null
  rank: number
  isHardExclusion?: boolean
}): Promise<string> {
  const { data, error } = await supabase
    .from('preferences')
    .insert({
      person_id: input.personId,
      semester_id: input.semesterId,
      kind: input.kind,
      course_id: input.courseId ?? null,
      period_id: input.periodId ?? null,
      rank: input.rank,
      is_hard_exclusion: input.isHardExclusion ?? false,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function deletePreference(id: string): Promise<void> {
  const { error } = await supabase.from('preferences').delete().eq('id', id)
  if (error) throw error
}

export async function fetchLocks(semesterId: string): Promise<Lock[]> {
  const { data, error } = await supabase
    .from('locks')
    .select('*')
    .eq('semester_id', semesterId)
  if (error) throw error
  return (data as Lock[]) ?? []
}

export async function addLock(input: {
  semesterId: string
  personId?: string | null
  courseId: string
  section?: number | null
  periodId?: string | null
  roomId?: string | null
  lockType: 'course_director' | 'assignment'
  note?: string
}): Promise<string> {
  const { data, error } = await supabase
    .from('locks')
    .insert({
      semester_id: input.semesterId,
      person_id: input.personId ?? null,
      course_id: input.courseId,
      section: input.section ?? null,
      period_id: input.periodId ?? null,
      room_id: input.roomId ?? null,
      lock_type: input.lockType,
      note: input.note ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function deleteLock(id: string): Promise<void> {
  const { error } = await supabase.from('locks').delete().eq('id', id)
  if (error) throw error
}

export async function fetchConstraints(semesterId: string): Promise<Constraint[]> {
  const { data, error } = await supabase
    .from('constraints')
    .select('*')
    .eq('semester_id', semesterId)
    .order('name')
  if (error) throw error
  return (data as Constraint[]) ?? []
}

/** Insert one constraint row (AD). Returns the new record id. */
export async function addConstraint(input: {
  semesterId: string
  name: string
  type: ConstraintType
  penalty: number
  params?: Record<string, number>
}): Promise<string> {
  const { data, error } = await supabase
    .from('constraints')
    .insert({
      semester_id: input.semesterId,
      name: input.name,
      type: input.type,
      penalty: input.penalty,
      params: input.params ?? {},
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updateConstraint(
  id: string,
  patch: { name?: string; penalty?: number; params?: Record<string, number> },
): Promise<string> {
  const { data, error } = await supabase
    .from('constraints')
    .update(patch)
    .eq('id', id)
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function deleteConstraint(id: string): Promise<void> {
  const { error } = await supabase.from('constraints').delete().eq('id', id)
  if (error) throw error
}

export async function fetchClassrooms(semesterId: string): Promise<Classroom[]> {
  const { data, error } = await supabase
    .from('classrooms')
    .select('*')
    .eq('semester_id', semesterId)
    .order('name')
  if (error) throw error
  return (data as Classroom[]) ?? []
}

/** Create a persisted schedule run. Returns the new run id. */
export async function createScheduleRun(input: {
  semesterId: string
  createdBy: string
  status?: RunStatus
  score?: number | null
}): Promise<string> {
  const { data, error } = await supabase
    .from('schedule_runs')
    .insert({
      semester_id: input.semesterId,
      created_by: input.createdBy,
      status: input.status ?? 'done',
      score: input.score ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/** Persist a solved run's assignments in bulk. */
export async function insertScheduleAssignments(rows: ScheduleAssignment[]): Promise<void> {
  if (rows.length === 0) return
  const payload = rows.map((r) => ({
    run_id: r.run_id,
    person_id: r.person_id,
    course_id: r.course_id,
    section: r.section,
    period_id: r.period_id,
    room_id: r.room_id,
    role: r.role,
  }))
  const { error } = await supabase.from('schedule_assignments').insert(payload)
  if (error) throw error
}

export async function fetchScheduleRuns(semesterId: string): Promise<ScheduleRun[]> {
  const { data, error } = await supabase
    .from('schedule_runs')
    .select('*')
    .eq('semester_id', semesterId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as ScheduleRun[]) ?? []
}

export async function fetchScheduleAssignments(runId: string): Promise<ScheduleAssignment[]> {
  const { data, error } = await supabase
    .from('schedule_assignments')
    .select('*')
    .eq('run_id', runId)
    .order('section')
  if (error) throw error
  return (data as ScheduleAssignment[]) ?? []
}

export async function deleteScheduleRun(runId: string): Promise<void> {
  const { error } = await supabase.from('schedule_runs').delete().eq('id', runId)
  if (error) throw error
}