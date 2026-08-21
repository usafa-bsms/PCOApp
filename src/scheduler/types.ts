import type { Day, PartOfDay } from '../lib/periods'

export type Role = 'faculty' | 'new_instructor' | 'academic_director' | 'lead_admin'
export type QualLevel = 'can_teach' | 'has_taught' | 'can_direct'
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
  | 'load_target'
export type RunStatus = 'running' | 'done' | 'failed'
export type AssignmentRole = 'director' | 'teacher'

export interface Person {
  id: string
  name: string
  role: Role
  /** Free-text label — context only, NOT authorization. */
  label?: string | null
  /** Target course load (soft goal). Reduced manually for extra responsibilities. */
  courseLoad: number
}

export interface Course {
  id: string
  code: string
  title?: string
  sections: number
  expectedEnrollment: number
  /** A double-period course occupies two consecutive periods (a 2-slot block). */
  isDoublePeriod?: boolean
}

export interface Qualification {
  personId: string
  courseId: string
  level: QualLevel
}

export interface PeriodInput {
  code: string
  day: Day
  slot: number
  partOfDay: PartOfDay
}

export interface Preference {
  personId: string
  kind: 'course' | 'period'
  courseId?: string
  period?: string
  /** lower = stronger positive preference */
  rank: number
  /** "will not teach X" / "cannot teach Y". Hard unless AD overrides. */
  isHardExclusion?: boolean
}

export interface Lock {
  /** The person to force; undefined if only period/room/section are locked. */
  personId?: string
  courseId: string
  section?: number
  period?: string
  roomId?: string
  lockType: LockType
}

export interface Constraint {
  type: ConstraintType
  /** integer; higher penalty => relaxed/violated later */
  penalty: number
  params: Record<string, number>
}

/** The full deterministic solver input, already normalized/normalized-readable. */
export interface SolveInput {
  persons: Person[]
  courses: Course[]
  qualifications: Qualification[]
  periods: PeriodInput[]
  preferences: Preference[]
  locks: Lock[]
  constraints: Constraint[]
  /** Room identifiers. If empty, room capacity is treated as unbounded. */
  rooms?: string[]
}

export interface Assignment {
  personId: string
  courseId: string
  section: number
  period: string
  roomId?: string
  role: AssignmentRole
  /** True when this section is the START of a two-period double block. */
  doubleBlockStart?: boolean
}

export interface Violation {
  constraintType: ConstraintType
  penalty: number
  detail: string
}

export interface SolveResult {
  assignments: Assignment[]
  score: number
  violations: Violation[]
}

export function emptySolveResult(): SolveResult {
  return { assignments: [], score: 0, violations: [] }
}