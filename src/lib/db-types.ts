import type { Role } from './rbac'

export type QualLevel = 'can_teach' | 'has_taught' | 'can_direct'

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