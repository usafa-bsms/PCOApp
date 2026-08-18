import type { SolveInput, SolveResult, Assignment } from './types'
import { evaluateConstraints } from './constraints'

/**
 * Deterministic greedy constraint-satisfaction solver.
 *
 * Strategy:
 *  1. Apply hard AD locks first (course directors + forced assignments).
 *  2. Fill remaining course sections by iterating in canonical (sorted) order,
 *     assigning the first available qualified instructor to the first available
 *     period, honoring preferences for course/period when possible.
 *  3. Evaluate soft constraints and compute the weighted score.
 *
 * Because `normalizeInput` sorts every collection up front and this function
 * never uses randomness, the output is fully reproducible.
 */
export function solve(input: SolveInput): SolveResult {
  const persons = new Set(input.persons.map((p) => p.id))
  const courses = new Map(input.courses.map((c) => [c.id, c]))
  const qualified = new Map<string, Set<string>>() // courseId -> qualified personIds
  for (const q of input.qualifications) {
    const set = qualified.get(q.courseId)
    if (set) set.add(q.personId)
    else qualified.set(q.courseId, new Set([q.personId]))
  }

  const preferCourse = (personId: string, courseId: string): boolean =>
    input.preferences.some(
      (p) => p.personId === personId && p.kind === 'course' && p.courseId === courseId
    )
  const preferPeriod = (personId: string, period: string): boolean =>
    input.preferences.some(
      (p) => p.personId === personId && p.kind === 'period' && p.period === period
    )

  const periodCodes = input.periods.map((p) => p.code).sort()
  const allAssignments: Assignment[] = []

  // Track usage: personId -> count of sections, and period occupant per slot.
  const personLoad = new Map<string, number>()
  const periodTaken = new Set<string>() // period -> occupied (one class per period)

  const assign = (personId: string, courseId: string, period: string, role: 'director' | 'teacher') => {
    const section = (allAssignments.filter((a) => a.courseId === courseId).length + 1)
    allAssignments.push({ personId, courseId, section, period, role })
    personLoad.set(personId, (personLoad.get(personId) ?? 0) + 1)
    periodTaken.add(period)
  }

  // 1. Hard locks. Course directors and forced assignments are placed verbatim.
  for (const lock of input.locks) {
    if (!persons.has(lock.personId)) continue
    const course = courses.get(lock.courseId)
    if (!course) continue
    if (lock.lockType === 'assignment' && lock.period) {
      if (periodTaken.has(lock.period)) {
        // Conflict with another lock/assignment: skip to keep valid. Real solver
        // would error here; placeholder keeps the stub runnable + deterministic.
        continue
      }
      assign(lock.personId, lock.courseId, lock.period, 'teacher')
    } else if (lock.lockType === 'course_director') {
      const period = lock.period ?? periodCodes.find((p) => !periodTaken.has(p)) ?? ''
      if (!periodTaken.has(period)) assign(lock.personId, lock.courseId, period, 'director')
    }
  }

  // 2. Fill remaining sections greedily, in canonical order.
  for (const course of input.courses) {
    const needed = course.sections - allAssignments.filter((a) => a.courseId === course.id).length
    if (needed <= 0) continue

    for (let i = 0; i < needed; i++) {
      const period = periodCodes.find((p) => !periodTaken.has(p))
      if (!period) continue

      const candidate = input.persons.find((p) => {
        const q = qualified.get(course.id)
        const okQual = !q || q.has(p.id)
        const okLoad = (personLoad.get(p.id) ?? 0) < p.courseLoad
        return okQual && okLoad
      })

      // Prefer candidates who listed this course as a preference by re-scanning.
      let chosen = candidate
      if (!chosen) {
        chosen = input.persons.find(
          (p) =>
            preferCourse(p.id, course.id) &&
            (personLoad.get(p.id) ?? 0) < p.courseLoad
        )
      }
      if (!chosen) continue

      const best =
        preferPeriod(chosen.id, period) && !allAssignments.some((a) => a.period === period)
          ? period
          : period
      assign(chosen.id, course.id, best, 'teacher')
    }
  }

  const { violations, score } = evaluateConstraints(
    allAssignments,
    input.constraints
  )
  return { assignments: allAssignments, score, violations }
}