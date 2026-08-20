import type { SolveInput, Assignment, Person, PeriodInput } from './types'
import { areConsecutivePeriods } from '../lib/periods'

/**
 * Deterministic constraint-search (CP/backtracking) solver.
 *
 * HIERARCHY (hardest first):
 *  1. Every required section is assigned. Violating this = infeasible schedule
 *     (hard: one class per instructor per period, per-period room-count cap).
 *  2. Hard choices: AD locks (directors + forced assignments) and faculty hard
 *     exclusions must hold exactly.
 *  3. Soft guidance: satisfy as many soft constraints as possible, relaxing them
 *     as little as needed (the search minimizes their total penalty).
 *
 * SEARCH: chronological backtracking, branch-and-bound.
 *  - Variable order: courses with the FEWEST qualified instructors first, then
 *    course code, then section (a cheap near-MRV proxy with O(1) per-node cost).
 *  - Value order (LCV): candidate (person, period) pairs tried cheapest-first
 *    by marginal soft cost; ties broken by canonical id/code.
 *  - Incremental score tracks course-level (spread / single-offering peak /
 *    two-section-same-block), person-level (consecutive / no-forced-break /
 *    single-day) and global (morning/afternoon min, M/T balance) penalties.
 *    The first complete solution seeds the bound; branches that can no longer
 *    beat it are pruned, up to a deterministic node budget.
 *
 * DETERMINISM: no randomness; every candidate list and tie-break is canonical.
 */

export interface CPOptions {
  /** Deterministic node budget. Default 2_000_000. */
  maxNodes?: number
}

export interface CPSolution {
  assignments: Assignment[]
  unassigned: number
  nodes: number
}

interface Job {
  courseId: string
  code: string
  section: number
  fixedPerson?: string
  fixedPeriod?: string
  done?: boolean
}

interface Placement {
  personId: string
  courseId: string
  section: number
  period: string
}

export function cspSolve(input: SolveInput, opts?: CPOptions): CPSolution {
  const maxNodes = opts?.maxNodes ?? 2_000_000
  const persons: Person[] = input.persons
  const periods: PeriodInput[] = input.periods
  const roomCap =
    input.rooms && input.rooms.length > 0 ? input.rooms.length : Number.POSITIVE_INFINITY

  const pen = (t: string): number =>
    input.constraints.find((c) => c.type === t)?.penalty ?? 100

  // ---------- hard inputs (canonical, O(1) checks) ----------
  const courseQualified = new Map<string, Set<string>>()
  for (const q of input.qualifications) {
    let s = courseQualified.get(q.courseId)
    if (!s) { s = new Set(); courseQualified.set(q.courseId, s) }
    s.add(q.personId)
  }
  const hardCourseExcl = new Map<string, Set<string>>()
  const hardPeriodExcl = new Map<string, Set<string>>()
  for (const p of input.preferences) {
    if (!p.isHardExclusion) continue
    if (p.kind === 'course' && p.courseId) {
      let s = hardCourseExcl.get(p.personId); if (!s) { s = new Set(); hardCourseExcl.set(p.personId, s) }
      s.add(p.courseId)
    } else if (p.kind === 'period' && p.period) {
      let s = hardPeriodExcl.get(p.personId); if (!s) { s = new Set(); hardPeriodExcl.set(p.personId, s) }
      s.add(p.period)
    }
  }
  const hardCourseExcluded = (pid: string, cid: string): boolean => hardCourseExcl.get(pid)?.has(cid) ?? false
  const hardPeriodExcluded = (pid: string, per: string): boolean => hardPeriodExcl.get(pid)?.has(per) ?? false

  // ---------- state ----------
  const personSlots = new Map<string, Map<string, number[]>>()
  const courseSlots = new Map<string, Map<string, number[]>>()
  const personBusy = new Map<string, Set<string>>()
  const periodUsed = new Map<string, number>()
  const personDays = new Map<string, Set<string>>()
  let morningCount = 0
  let afternoonCount = 0
  let mCount = 0
  let tCount = 0
  let score = 0
  const placements: Placement[] = []

  const dayOf = (code: string): string => code.charAt(0)
  const slotOf = (code: string): number => Number(code.charAt(1))
  const sorted = (a: number[]): number[] => [...a].sort((x, y) => x - y)
  const getSlots = (m: Map<string, number[]>, key: string): number[] => {
    let a = m.get(key); if (!a) { a = []; m.set(key, a) } return a
  }
  const courseDayMap = (cid: string): Map<string, number[]> => {
    let m = courseSlots.get(cid); if (!m) { m = new Map(); courseSlots.set(cid, m) } return m
  }
  const personDayMap = (pid: string): Map<string, number[]> => {
    let m = personSlots.get(pid); if (!m) { m = new Map(); personSlots.set(pid, m) } return m
  }

  const personContrib = (pid: string): number => {
    let cost = 0
    const days = personDays.get(pid)
    if (days && days.size > 1) cost += pen('single_day')
    const sb = personSlots.get(pid)
    if (!sb) return cost
    for (const d of [...sb.keys()].sort()) {
      const slots = sorted(sb.get(d)!)
      for (let i = 1; i < slots.length; i++) {
        if (!areConsecutivePeriods(periods, `${d}${slots[i - 1]}`, `${d}${slots[i]}`)) {
          cost += pen('consecutive_periods')
        }
      }
      if (slots.length >= 3) {
        for (let i = 1; i < slots.length - 1; i++) {
          if (slots[i] - slots[i - 1] > 1 && slots[i + 1] - slots[i] > 1) cost += pen('no_forced_break')
        }
      }
    }
    return cost
  }

  const inSameBlock = (a: number, b: number): boolean =>
    Math.abs(a - b) === 1 && Math.floor((a - 1) / 2) === Math.floor((b - 1) / 2)

  const courseContrib = (cid: string): number => {
    const sb = courseSlots.get(cid)
    if (!sb) return 0
    let cost = 0
    const m = sb.get('M')?.length ?? 0
    const t = sb.get('T')?.length ?? 0
    const total = m + t
    const mornings = [...(sb.get('M') ?? []), ...(sb.get('T') ?? [])]
    if (total >= 2 && (m === 0 || t === 0)) cost += pen('spread_sections') * (total - 1)
    if (total === 1 && [1, 5, 6].includes(mornings[0])) cost += pen('single_offering_peak')
    if (total === 2 && inSameBlock(mornings[0], mornings[1])) cost += pen('two_section_same_block')
    return cost
  }

  const globalContrib = (): number => {
    let cost = 0
    const mMin = input.constraints.find((c) => c.type === 'morning_min')?.params.min ?? 0
    const aMin = input.constraints.find((c) => c.type === 'afternoon_min')?.params.min ?? 0
    if (morningCount < mMin) cost += pen('morning_min') * (mMin - morningCount)
    if (afternoonCount < aMin) cost += pen('afternoon_min') * (aMin - afternoonCount)
    if (mCount !== tCount) cost += pen('balance_mt') * Math.abs(mCount - tCount)
    return cost
  }

  /** Mutate state by placing (dir=1) or removing (dir=-1) one class. */
  const apply = (pid: string, cid: string, section: number, period: string, dir: 1 | -1): void => {
    const day = dayOf(period)
    const slot = slotOf(period)
    const isT = day === 'T'

    const pBefore = personContrib(pid)
    const cBefore = courseContrib(cid)
    const gBefore = globalContrib()

    if (dir === 1) {
      getSlots(courseDayMap(cid), day).push(slot)
      getSlots(personDayMap(pid), day).push(slot)
      let b = personBusy.get(pid); if (!b) { b = new Set(); personBusy.set(pid, b) }
      b.add(period)
      periodUsed.set(period, (periodUsed.get(period) ?? 0) + 1)
      let d = personDays.get(pid); if (!d) { d = new Set(); personDays.set(pid, d) }
      d.add(day)
      if (isT) tCount++; else mCount++
      if (slot <= 3) morningCount++; else afternoonCount++
      placements.push({ personId: pid, courseId: cid, section, period })
    } else {
      const cs = getSlots(courseDayMap(cid), day); cs.splice(cs.indexOf(slot), 1)
      const ps = getSlots(personDayMap(pid), day); ps.splice(ps.indexOf(slot), 1)
      personBusy.get(pid)?.delete(period); if (personBusy.get(pid)?.size === 0) personBusy.delete(pid)
      periodUsed.set(period, (periodUsed.get(period) ?? 0) - 1)
      personDays.get(pid)?.delete(day); if (personDays.get(pid)?.size === 0) personDays.delete(pid)
      if (isT) tCount--; else mCount--
      if (slot <= 3) morningCount--; else afternoonCount--
      placements.pop()
    }

    const pAfter = personContrib(pid)
    const cAfter = courseContrib(cid)
    const gAfter = globalContrib()
    score += (pAfter - pBefore) + (cAfter - cBefore) + (gAfter - gBefore)
  }

  /** Precompute marginal cost of placing candidate without committing. */
  const marginal = (pid: string, cid: string, period: string): number => {
    apply(pid, cid, 0, period, 1)
    const s = score
    apply(pid, cid, 0, period, -1)
    return s
  }

  // ---------- jobs ----------
  const coursesSorted = [...input.courses].sort(
    (a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  )
  const jobs: Job[] = []
  for (const c of coursesSorted) {
    for (let sec = 1; sec <= c.sections; sec++) jobs.push({ courseId: c.id, code: c.code, section: sec })
  }
  const directions: Assignment[] = []
  const resultAssign: Assignment[] = []

  // directors (course-level annotations, no teaching slot)
  const directorAt = new Map<string, string>()
  for (const lock of input.locks) {
    if (lock.lockType === 'course_director' && lock.personId && !directorAt.has(lock.courseId)) {
      directorAt.set(lock.courseId, lock.personId)
      directions.push({
        personId: lock.personId, courseId: lock.courseId, section: lock.section ?? 1, period: lock.period ?? '', role: 'director',
      })
    }
  }

  // full assignment locks (person+course+period) pin a job; placed before search.
  const jobTaken = new Set<Job>()
  const jobBy = (cid: string, sec: number): Job | undefined =>
    jobs.find((j) => j.courseId === cid && j.section === sec)
  const locksSorted = [...input.locks].sort(
    (a, b) =>
      (a.courseId < b.courseId ? -1 : a.courseId > b.courseId ? 1 : 0) ||
      (a.section ?? 0) - (b.section ?? 0),
  )
  for (const lock of locksSorted) {
    if (lock.lockType !== 'assignment') continue
    const job = lock.section
      ? jobBy(lock.courseId, lock.section)
      : jobs.find((j) => j.courseId === lock.courseId && !jobTaken.has(j))
    if (!job || jobTaken.has(job)) continue
    jobTaken.add(job)
    if (lock.personId && lock.period) {
      if (periodUsed.get(lock.period) !== undefined && (periodUsed.get(lock.period) ?? 0) >= roomCap) continue
      if (personBusy.get(lock.personId)?.has(lock.period)) continue
      if (hardPeriodExcluded(lock.personId, lock.period)) continue
      apply(lock.personId, lock.courseId, job.section, lock.period, 1)
      job.done = true
    } else if (lock.personId) {
      job.fixedPerson = lock.personId
    } else if (lock.period) {
      job.fixedPeriod = lock.period
    }
  }

  // ---------- branch and bound ----------
  let best: Placement[] | null = null
  let bestScore = Number.POSITIVE_INFINITY
  let nodes = 0

  const search = (pool: Job[]): void => {
    nodes++
    if (nodes > maxNodes) return
    if (pool.length === 0) {
      if (score < bestScore) {
        bestScore = score
        best = placements.map((p) => ({ ...p }))
      }
      return
    }
    if (score >= bestScore) return // cannot beat the incumbent

    // variable order: fewest qualified persons, then code, then section
    const idx = pool
      .map((j, i) => ({ j, i }))
      .sort(
        (x, y) =>
          (courseQualified.get(x.j.courseId)?.size ?? 0) - (courseQualified.get(y.j.courseId)?.size ?? 0) ||
          (x.j.code < y.j.code ? -1 : x.j.code > y.j.code ? 1 : 0) ||
          x.j.section - y.j.section,
      )[0].i
    const job = pool[idx]
    const rest = pool.filter((_, i) => i !== idx)
    const cid = job.courseId
    const qual = courseQualified.get(cid)

    const cands: Array<{ pid: string; period: string }> = []
    for (const p of persons) {
      if (job.fixedPerson && p.id !== job.fixedPerson) continue
      if (!job.fixedPerson && !(qual?.has(p.id) ?? false)) continue
      if (!job.fixedPerson && hardCourseExcluded(p.id, cid)) continue
      for (const per of periods) {
        const code = per.code
        if (job.fixedPeriod && code !== job.fixedPeriod) continue
        if (personBusy.get(p.id)?.has(code)) continue
        if (periodUsed.get(code) !== undefined && (periodUsed.get(code) ?? 0) >= roomCap) continue
        if (hardPeriodExcluded(p.id, code)) continue
        cands.push({ pid: p.id, period: code })
      }
    }

    cands.sort(
      (a, b) =>
        marginal(a.pid, cid, a.period) - marginal(b.pid, cid, b.period) ||
        (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : 0) ||
        (a.period < b.period ? -1 : a.period > b.period ? 1 : 0),
    )

    for (const c of cands) {
      if (nodes > maxNodes) return
      if (score >= bestScore) return
      apply(c.pid, cid, job.section, c.period, 1)
      search(rest)
      apply(c.pid, cid, job.section, c.period, -1)
    }
  }

  search(jobs.filter((j) => !j.done))

  // ---------- reconstruct ----------
  resultAssign.push(...directions)
  const source = best ?? placements
  for (const p of source) {
    resultAssign.push({ personId: p.personId, courseId: p.courseId, section: p.section, period: p.period, role: 'teacher' })
  }

  const teacherKeys = new Set(resultAssign.filter((a) => a.role === 'teacher').map((a) => `${a.courseId}@${a.section}`))
  let unassigned = 0
  for (const j of jobs) if (!teacherKeys.has(`${j.courseId}@${j.section}`)) unassigned++

  return { assignments: resultAssign, unassigned, nodes }
}