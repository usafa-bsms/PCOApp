import type { Role } from './rbac'

export type QualLevel = 'can_teach' | 'has_taught' | 'can_direct'
export type PreferenceKind = 'course' | 'period'
export type LockType = 'course_director' | 'assignment'
export type ConstraintType =
  | 'spread_sections'
  | 'morning_min'
  | 'afternoon_min'
  | 'balance_mt'
  | 'consecutive_periods'
  | 'single_day'
  | 'no_forced_break'
  | 'single_offering_peak'
  | 'two_section_same_block'

export interface Semester {
  id: string
  name: string
  starts_on: string | null
  ends_on: string | null
  is_active: boolean
}

export interface Person {
  id: string
  semester_id: string
  name: string
  email: string
  role: Role
  label: string | null
  course_load: number
  auth_user_id: string | null
}

export interface Course {
  id: string
  semester_id: string
  code: string
  title: string | null
  sections: number
  expected_enrollment: number
  is_double_period: boolean
}

export interface Qualification {
  id: string
  person_id: string
  course_id: string
  level: QualLevel
}

export interface Classroom {
  id: string
  semester_id: string
  name: string
  capacity: number
  assignable: boolean
}

/** A per-semester period row (codes M1..M6/T1..T6). */
export interface DbPeriod {
  id: string
  semester_id: string
  code: string
  day: 'M' | 'T'
  slot: number
  part_of_day: 'morning' | 'afternoon'
}

export interface Preference {
  id: string
  person_id: string
  semester_id: string
  kind: PreferenceKind
  course_id: string | null
  period_id: string | null
  rank: number
  is_hard_exclusion: boolean
}

export interface Lock {
  id: string
  semester_id: string
  person_id: string | null
  course_id: string
  section: number | null
  period_id: string | null
  room_id: string | null
  lock_type: LockType
  note: string | null
}

export interface Constraint {
  id: string
  semester_id: string
  name: string
  type: ConstraintType
  penalty: number
  params: Record<string, number>
}