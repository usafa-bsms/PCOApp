import type { Day, PartOfDay } from '../lib/periods'

export type Role = 'faculty' | 'academic_director' | 'lead_admin'
export type QualLevel = 'can_teach' | 'has_taught' | 'can_direct'
export type LockType = 'course_director' | 'assignment'
export type ConstraintType =
  | 'spread_sections'
  | 'morning_min'
  | 'afternoon_min'
  | 'balance_mt'
export type RunStatus = 'running' | 'done' | 'failed'
export type AssignmentRole = 'director' | 'teacher'

export interface Person {
  id: string
  name: string
  role: Role
  /** Free-text label — context only, NOT authorization. */
  label?: string | null
  courseLoad: number
}

export interface Course {
  id: string
  code: string
  sections: number
  expectedEnrollment: number
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
  /** lower = stronger preference */
  rank: number
}

export interface Lock {
  personId: string
  courseId: string
  period?: string
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
}

export interface Assignment {
  personId: string
  courseId: string
  section: number
  period: string
  role: AssignmentRole
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