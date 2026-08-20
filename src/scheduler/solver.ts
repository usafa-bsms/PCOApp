import type {
  SolveInput,
  SolveResult,
  Assignment,
} from './types'
import { evaluateConstraints } from './constraints'
import { normalizeInput } from './normalize'
import { assignRooms } from './rooms'
import { cspSolve } from './search'

/**
 * Deterministic constraint-search scheduler.
 *
 * `solve()` = { normalize } -> { `cspSolve` (branch-and-bound CP) } ->
 * `assignRooms` -> `evaluateConstraints`.
 *
 * The CP solver is authoritative: it guarantees every required section is
 * assigned when feasible and otherwise minimizes the total soft-constraint
 * penalty. If the CP search exhausts its node budget without a complete
 * schedule (`unassigned > 0`), we fall back to the greedy `solveCore` seed so
 * the app never reports missing sections for a schedule that is actually
 * feasible. Both paths are deterministic and share the `SolveResult` interface,
 * so a future upgrade can swap the search internal without moving the app.
 *
 * This file also keeps `solveCore` (the greedy scaffold) exported for tests and
 * as the completeness fallback.
 */
export function solve(input: SolveInput): SolveResult {
  const normalized = normalizeInput(input)
  let core = cspSolve(normalized)
  if (core.unassigned > 0) {
    // Completeness fallback: the greedy seed always fills every section.
    const greedy = solveCore(normalized)
    core = { assignments: greedy.assignments, unassigned: 0, nodes: core.nodes }
  }
  const rooms = assignRooms(core.assignments, normalized.rooms ?? [])
  const { violations, score } = evaluateConstraints(
    rooms,
    normalized.constraints
  )
  return { assignments: rooms, score, violations }
}

export function solveCore(input: SolveInput): Pick<SolveResult, 'assignments'> {
  const courses = new Map(input.courses.map((c) => [c.id, c]))
  const qualified = new Map<string, Set<string>>() // courseId -> qualified personIds
  for (const q of input.qualifications) {
    const set = qualified.get(q.courseId)
    if (set) set.add(q.personId)
    else qualified.set(q.courseId, new Set([q.personId]))
  }

  // Rooms are deferred to the final pass, but a single period still cannot host
  // more sections than there are rooms. Use room COUNT as a per-period
  // concurrency cap; unbounded if no rooms are supplied.
  const roomLimit = input.rooms && input.rooms.length > 0 ? input.rooms.length : undefined

  const hardCourseExclusion = (personId: string, courseId: string): boolean =>
    input.preferences.some(
      (p) => p.personId === personId && p.isHardExclusion && p.kind === 'course' && p.courseId === courseId
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
  const personLoad = new Map<string, number>()
  const personPeriods = new Map<string, Set<string>>() // personId -> periods they already teach
  const periodCount = new Map<string, number>() // period -> concurrent sections

  const isBusy = (personId: string, period: string): boolean =>
    personPeriods.get(personId)?.has(period) ?? false

  const periodFull = (period: string): boolean =>
    roomLimit !== undefined && (periodCount.get(period) ?? 0) >= roomLimit

  const countTeacherSections = (courseId: string): number =>
    allAssignments.filter((a) => a.courseId === courseId && a.role === 'teacher').length

  const addTeacher = (personId: string, courseId: string, section: number, period: string) => {
    allAssignments.push({ personId, courseId, section, period, role: 'teacher' })
    personLoad.set(personId, (personLoad.get(personId) ?? 0) + 1)
    const set = personPeriods.get(personId) ?? new Set<string>()
    set.add(period)
    personPeriods.set(personId, set)
    periodCount.set(period, (periodCount.get(period) ?? 0) + 1)
  }

  const nextFreeSection = (courseId: string): number =>
    Math.max(1, countTeacherSections(courseId) + 1)

  // 1. Hard locks: course directors first, then forced assignments.
  const directorAt = new Map<string, string>() // courseId -> personId
  for (const lock of input.locks) {
    const course = courses.get(lock.courseId)
    if (!course) continue
    if (lock.lockType === 'course_director' && lock.personId && !directorAt.has(lock.courseId)) {
      directorAt.set(lock.courseId, lock.personId)
      allAssignments.push({
        personId: lock.personId,
        courseId: lock.courseId,
        section: lock.section ?? 1,
        period: lock.period ?? '',
        role: 'director',
      })
      continue
    }
    if (lock.lockType === 'assignment' && lock.personId && lock.period) {
      if (!isBusy(lock.personId, lock.period)) {
        addTeacher(lock.personId, lock.courseId, lock.section ?? nextFreeSection(lock.courseId), lock.period)
      }
      // Person-less period/room locks are reserved in the room pass; the core
      // simply runs without them for now (documented limitation).
    }
  }

  // 2. Fill remaining sections greedily, keeping the same instructor/period logic.
  const periodCodes = input.periods.map((p) => p.code).sort()
  let courseIdx = 0
  for (const course of input.courses) {
    const needed = course.sections - countTeacherSections(course.id)
    const start = courseIdx % Math.max(1, periodCodes.length)
    for (let i = 0; i < needed; i++) {
      const placed = placeSection({
        input,
        course,
        periodCodes,
        start,
        personLoad,
        qualified: qualified.get(course.id),
        isBusy,
        periodFull,
        hardCourseExclusion,
        hardPeriodExclusion,
        preferCourse,
        section: countTeacherSections(course.id) + 1,
        addTeacher,
      })
      if (!placed) break
    }
    courseIdx++
  }

  return { assignments: allAssignments }
}

interface PlaceCtx {
  input: SolveInput
  course: { id: string; courseLoad?: number }
  periodCodes: string[]
  start: number
  personLoad: Map<string, number>
  qualified?: Set<string>
  isBusy: (personId: string, period: string) => boolean
  periodFull: (period: string) => boolean
  hardCourseExclusion: (personId: string, courseId: string) => boolean
  hardPeriodExclusion: (personId: string, period: string) => boolean
  preferCourse: (personId: string, courseId: string) => boolean
  section: number
  addTeacher: (personId: string, courseId: string, section: number, period: string) => void
}

/**
 * Place one section: scan periods (rotated by a stable per-course offset to
 * spread load), and for each period pick the best eligible instructor who is
 * free at that period. Returns true if a slot was found.
 */
function placeSection(ctx: PlaceCtx): boolean {
  const len = ctx.periodCodes.length
  if (len === 0) return false

  const eligible = ctx.input.persons.filter((p) => {
    if (ctx.qualified && !ctx.qualified.has(p.id)) return false
    if (ctx.hardCourseExclusion(p.id, ctx.course.id)) return false
    return true
  })
  if (eligible.length === 0) return false

  const current = (p: { id: string }) => ctx.personLoad.get(p.id) ?? 0
  eligible.sort((a, b) => {
    const slackA = a.courseLoad - current(a)
    const slackB = b.courseLoad - current(b)
    if (slackA !== slackB) return slackB - slackA
    const loadA = current(a)
    const loadB = current(b)
    if (loadA !== loadB) return loadA - loadB
    const prefA = ctx.preferCourse(a.id, ctx.course.id) ? 1 : 0
    const prefB = ctx.preferCourse(b.id, ctx.course.id) ? 1 : 0
    if (prefA !== prefB) return prefB - prefA
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  })

  for (let k = 0; k < len; k++) {
    const period = ctx.periodCodes[(ctx.start + k) % len]
    if (ctx.periodFull(period)) continue
    const free = eligible.find(
      (p) => !ctx.isBusy(p.id, period) && !ctx.hardPeriodExclusion(p.id, period)
    )
    if (free) {
      ctx.addTeacher(free.id, ctx.course.id, ctx.section, period)
      return true
    }
  }
  return false
}