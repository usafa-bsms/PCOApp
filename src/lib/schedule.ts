import type {
  SolveInput,
  Assignment,
} from '../scheduler/types'
import type {
  Person,
  Course,
  Qualification,
  DbPeriod,
  Preference,
  Lock,
  Constraint,
  Classroom,
  ScheduleAssignment,
} from './db-types'

/** All the DB rows one semester feeds the solver. */
export interface SolverSelections {
  persons: Person[]
  courses: Course[]
  qualifications: Qualification[]
  periods: DbPeriod[]
  preferences: Preference[]
  locks: Lock[]
  constraints: Constraint[]
  classrooms: Classroom[]
}

/**
 * Map per-semester DB rows into the scheduler's SolveInput. All entity ids stay
 * uuid (persons/courses/rooms); periods are translated to their canonical code
 * (the solver keys scheduling by code, e.g. "M1"), while preference/lock
 * period_id pointers are resolved to codes and EVERYTHING is later mapped back
 * to a period uuid when persisting.
 */
export function buildSolveInput(a: SolverSelections): SolveInput {
  const periodCode = new Map(a.periods.map((p) => [p.id, p.code]))
  const assignableRooms = a.classrooms.filter((r) => r.assignable)

  return {
    persons: a.persons.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      label: p.label,
      courseLoad: p.course_load,
    })),
    courses: a.courses.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title ?? undefined,
      sections: c.sections,
      expectedEnrollment: c.expected_enrollment,
    })),
    qualifications: a.qualifications.map((q) => ({
      personId: q.person_id,
      courseId: q.course_id,
      level: q.level,
    })),
    periods: a.periods.map((per) => ({
      code: per.code,
      day: per.day,
      slot: per.slot,
      partOfDay: per.part_of_day,
    })),
    preferences: a.preferences.map((p) => ({
      personId: p.person_id,
      kind: p.kind,
      courseId: p.course_id ?? undefined,
      period: p.period_id ? periodCode.get(p.period_id) : undefined,
      rank: p.rank,
      isHardExclusion: p.is_hard_exclusion,
    })),
    locks: a.locks.map((l) => ({
      personId: l.person_id ?? undefined,
      courseId: l.course_id,
      section: l.section ?? undefined,
      period: l.period_id ? periodCode.get(l.period_id) : undefined,
      roomId: l.room_id ?? undefined,
      lockType: l.lock_type,
    })),
    constraints: a.constraints.map((c) => ({
      type: c.type,
      penalty: c.penalty,
      params: c.params,
    })),
    rooms: assignableRooms.map((r) => r.id),
  }
}

/**
 * Convert solver Assignment rows into persistable schedule_assignments, mapping
 * each assignment's period code back to the semester's period uuid.
 */
export function assignmentsToRows(
  assignments: Assignment[],
  runId: string,
  periodByCode: Map<string, string>,
): ScheduleAssignment[] {
  return assignments.map((a) => ({
    run_id: runId,
    person_id: a.personId,
    course_id: a.courseId,
    section: a.section,
    period_id: periodByCode.get(a.period) ?? '',
    room_id: a.roomId ?? null,
    role: a.role,
  }))
}