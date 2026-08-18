import type { SolveInput, SolveResult, Assignment } from './types'
import { evaluateConstraints } from './constraints'
import { areConsecutivePeriods } from '../lib/periods'

/**
 * Deterministic greedy constraint-satisfaction solver.
 *
 * Strategy:
 *  1. Apply hard AD locks first (course directors + forced assignments). Locks
 *     may pin any subset of {person, course, section, period, room}; unpinned
 *     parts are filled by the greedy pass. A course director is a course-level
 *     role that does NOT itself consume a teaching period.
 *  2. Faculty hard exclusions ("will not teach X" / "cannot teach Y") are hard.
 *  3. Fill remaining course sections greedily in canonical (sorted) order,
 *     preferring qualified instructors closest to their (soft) course-load
 *     target and honoring course/period preferences.
 *  4. Evaluate soft constraints and compute the weighted score.
 *
 * Determinism: `normalizeInput` sorts every collection up front and this
 * function never uses randomness.
 */
export function solve(input: SolveInput): SolveResult {
  const courses = new Map(input.courses.map((c) => [c.id, c]))
  const qualified = new Map<string, Set<string>>() // courseId -> qualified personIds
  for (const q of input.qualifications) {
    const set = qualified.get(q.courseId)
    if (set) set.add(q.personId)
    else qualified.set(q.courseId, new Set([q.personId]))
  }

  const hardCourseExclusion = (personId: string, courseId: string): boolean =>
    input.preferences.some(
      (p) =>
        p.personId === personId &&
        p.isHardExclusion &&
        p.kind === 'course' &&
        p.courseId === courseId
    )
  const hardPeriodExclusion = (personId: string, period: string): boolean =>
    input.preferences.some(
      (p) => p.personId === personId && p.isHardExclusion && p.kind === 'period' && p.period === period
    )
  const preferCourse = (personId: string, courseId: string): boolean =>
    input.preferences.some(
      (p) => !p.isHardExclusion && p.personId === personId && p.kind === 'course' && p.courseId === courseId
    )

  const allAssignments: Assignment[] = []
  const personLoad = new Map<string, number>() // teaching sections per person
  const periodTaken = new Set<string>() // teaching periods occupied (one class per period)

  const countCourseSections = (courseId: string): number =>
    allAssignments.filter((a) => a.courseId === courseId && a.role === 'teacher').length

  const addTeacher = (personId: string, courseId: string, section: number, period: string, roomId?: string) => {
    allAssignments.push({ personId, courseId, section, period, roomId, role: 'teacher' })
    personLoad.set(personId, (personLoad.get(personId) ?? 0) + 1)
    periodTaken.add(period)
  }

  // 1. Hard locks.
  for (const lock of input.locks) {
    const course = courses.get(lock.courseId)
    if (!course) continue

    if (lock.lockType === 'course_director' && lock.personId) {
      // Director is a course-level assignment. It does not occupy a teaching
      // period or count toward the teaching load. Period is optional metadata.
      allAssignments.push({
        personId: lock.personId,
        courseId: lock.courseId,
        section: lock.section ?? 1,
        period: lock.period ?? '',
        roomId: lock.roomId,
        role: 'director',
      })
      continue
    }

    if (lock.lockType === 'assignment') {
      const periodFree = !lock.period || !periodTaken.has(lock.period)
      if (lock.period) periodTaken.add(lock.period) // reserve the period regardless of person
      if (lock.personId && lock.period && periodFree) {
        const section = lock.section ?? Math.max(1, countCourseSections(lock.courseId) + 1)
        addTeacher(lock.personId, lock.courseId, section, lock.period, lock.roomId)
      }
      // person-less period/room locks: period reserved above; person filled in step 2.
    }
  }

  // 2. Fill remaining sections greedily, in canonical course order.
  for (const course of input.courses) {
    const needed = course.sections - countCourseSections(course.id)
    for (let i = 0; i < needed; i++) {
      const section = countCourseSections(course.id) + 1
      const period = input.periods
        .map((p) => p.code)
        .filter((code) => !periodTaken.has(code))
        .sort()[0]
      if (!period) break

      const pick = selectInstructor(input, {
        courseId: course.id,
        period,
        qualified: qualified.get(course.id),
        personLoad,
        hardCourseExclusion,
        hardPeriodExclusion,
        preferCourse,
      })
      if (!pick) continue
      addTeacher(pick.id, course.id, section, period, pick.roomId)
    }
  }

  const { violations, score } = evaluateConstraints(allAssignments, input.constraints)
  return { assignments: allAssignments, score, violations }
}

interface SelectCtx {
  courseId: string
  period: string
  qualified?: Set<string>
  personLoad: Map<string, number>
  hardCourseExclusion: (personId: string, courseId: string) => boolean
  hardPeriodExclusion: (personId: string, period: string) => boolean
  preferCourse: (personId: string, courseId: string) => boolean
}

/**
 * Deterministically pick an instructor for one section from the people who are
 * (a) qualified, (b) not hard-excluded from this course/period. Course load is a
 * SOFT target: we prefer whoever is farthest below their target, then the
 * fewest sections, then alphabetical. Preferring a course/period bumps rank if
 * all else is equal. Returns undefined if nobody is eligible.
 */
function selectInstructor(
  input: SolveInput,
  ctx: SelectCtx
): { id: string; roomId?: string } | undefined {
  const eligible = input.persons.filter((p) => {
    if (ctx.qualified && !ctx.qualified.has(p.id)) return false
    if (ctx.hardCourseExclusion(p.id, ctx.courseId)) return false
    if (ctx.hardPeriodExclusion(p.id, ctx.period)) return false
    return true
  })

  if (eligible.length === 0) return undefined

  const current = (p: { id: string }) => ctx.personLoad.get(p.id) ?? 0
  eligible.sort((a, b) => {
    const slackA = a.courseLoad - current(a)
    const slackB = b.courseLoad - current(b)
    if (slackA !== slackB) return slackB - slackA // most below target first
    const loadA = current(a)
    const loadB = current(b)
    if (loadA !== loadB) return loadA - loadB
    const prefA = ctx.preferCourse(a.id, ctx.courseId) ? 1 : 0
    const prefB = ctx.preferCourse(b.id, ctx.courseId) ? 1 : 0
    if (prefA !== prefB) return prefB - prefA
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  })

  return { id: eligible[0].id }
}

export { areConsecutivePeriods }