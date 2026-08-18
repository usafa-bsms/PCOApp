import type { SolveResult, Assignment, Constraint } from './types'
import { areConsecutivePeriods } from '../lib/periods'

const teachers = (assignments: Assignment[]): Assignment[] =>
  assignments.filter((a) => a.role !== 'director')

const dayOf = (period: string): string => period.charAt(0)
const slotOf = (period: string): number => Number(period.charAt(1))

/**
 * Evaluate every soft constraint against the assignments. Deterministic:
 * iteration order is fixed; each constraint type produces a sorted list of
 * Violations so results are reproducible regardless of call sequence.
 *
 * Classification is approximate until the scheduling-guidance PDF is encoded;
 * penalty magnitudes and detection details can be tuned there.
 */
export function evaluateConstraints(
  assignments: Assignment[],
  constraints: Constraint[]
): { violations: SolveResult['violations']; score: number } {
  const ts = teachers(assignments)
  const byCourse: Map<string, Assignment[]> = new Map()
  for (const a of ts) {
    const list = byCourse.get(a.courseId)
    if (list) list.push(a)
    else byCourse.set(a.courseId, [a])
  }

  const byPerson: Map<string, Assignment[]> = new Map()
  for (const a of ts) {
    const list = byPerson.get(a.personId)
    if (list) list.push(a)
    else byPerson.set(a.personId, [a])
  }

  const periodCodes = [...new Set(ts.map((a) => a.period))].sort()
  const periods = periodCodes.map((code) => ({
    code,
    day: dayOf(code) as 'M' | 'T',
    slot: slotOf(code),
    partOfDay: slotOf(code) <= 3 ? ('morning' as const) : ('afternoon' as const),
  }))

  const violations: SolveResult['violations'] = []

  for (const c of constraints) {
    switch (c.type) {
      case 'balance_mt': {
        const m = ts.filter((a) => dayOf(a.period) === 'M').length
        const t = ts.filter((a) => dayOf(a.period) === 'T').length
        const imbalance = Math.abs(m - t)
        if (imbalance > 0) {
          violations.push({
            constraintType: 'balance_mt',
            penalty: c.penalty * imbalance,
            detail: `M/T imbalance of ${imbalance} section(s)`,
          })
        }
        break
      }
      case 'morning_min': {
        const min = c.params.min ?? 0
        const morning = ts.filter((a) => slotOf(a.period) <= 3).length
        if (morning < min) {
          violations.push({
            constraintType: 'morning_min',
            penalty: c.penalty * (min - morning),
            detail: `${min - morning} morning section(s) short of ${min}`,
          })
        }
        break
      }
      case 'afternoon_min': {
        const min = c.params.min ?? 0
        const afternoon = ts.filter((a) => slotOf(a.period) >= 4).length
        if (afternoon < min) {
          violations.push({
            constraintType: 'afternoon_min',
            penalty: c.penalty * (min - afternoon),
            detail: `${min - afternoon} afternoon section(s) short of ${min}`,
          })
        }
        break
      }
      case 'spread_sections': {
        for (const [courseId, list] of byCourse) {
          if (list.length < 2) continue
          const m = list.filter((a) => dayOf(a.period) === 'M').length
          const t = list.filter((a) => dayOf(a.period) === 'T').length
          const spread = Math.abs(m - t)
          if (spread === list.length) {
            violations.push({
              constraintType: 'spread_sections',
              penalty: c.penalty * (spread - 1),
              detail: `${courseId}: all ${list.length} sections on one day`,
            })
          }
        }
        break
      }
      case 'consecutive_periods': {
        // Prefer consecutive classes: penalize gaps between a person's classes
        // on the same day (M4->M5 is a lunch gap, so it counts as a gap).
        for (const [personId, list] of byPerson) {
          const perDay = new Map<string, number[]>()
          for (const a of list) {
            const d = dayOf(a.period)
            const arr = perDay.get(d) ?? []
            arr.push(slotOf(a.period))
            perDay.set(d, arr)
          }
          for (const [day, slots] of [...perDay.entries()].sort()) {
            const sorted = [...slots].sort((x, y) => x - y)
            if (sorted.length < 2) continue
            for (let i = 1; i < sorted.length; i++) {
              const prev = `${day}${sorted[i - 1]}`
              const cur = `${day}${sorted[i]}`
              if (!areConsecutivePeriods(periods as never, prev, cur)) {
                violations.push({
                  constraintType: 'consecutive_periods',
                  penalty: c.penalty,
                  detail: `${personId}: gap between ${prev} and ${cur}`,
                })
              }
            }
          }
        }
        break
      }
      case 'single_day': {
        // Prefer an instructor's classes on one day rather than split M+T.
        for (const [personId, list] of byPerson) {
          const days = new Set(list.map((a) => dayOf(a.period)))
          if (days.size > 1) {
            violations.push({
              constraintType: 'single_day',
              penalty: c.penalty,
              detail: `${personId} teaches on ${[...days].sort().join('+')}`,
            })
          }
        }
        break
      }
      case 'no_forced_break': {
        // Avoid a mid-day gap with classes on both sides (e.g. M1,M3,M5).
        for (const [personId, list] of byPerson) {
          const perDay = new Map<string, number[]>()
          for (const a of list) {
            const d = dayOf(a.period)
            const arr = perDay.get(d) ?? []
            arr.push(slotOf(a.period))
            perDay.set(d, arr)
          }
          for (const [, slots] of [...perDay.entries()].sort()) {
            if (slots.length < 3) continue
            const sorted = [...slots].sort((x, y) => x - y)
            for (let i = 1; i < sorted.length - 1; i++) {
              const prev = sorted[i - 1]
              const cur = sorted[i]
              const next = sorted[i + 1]
              if (cur - prev > 1 && next - cur > 1) {
                violations.push({
                  constraintType: 'no_forced_break',
                  penalty: c.penalty,
                  detail: `${personId}: hole at slot ${cur} between ${prev} and ${next}`,
                })
              }
            }
          }
        }
        break
      }
      case 'single_offering_peak': {
        // Single-offering courses must not run in slot 1, 5, or 6 (ICs have a
        // high excusal rate there). Applied to courses with exactly one section.
        for (const [courseId, list] of byCourse) {
          if (list.length !== 1) continue
          const slot = slotOf(list[0].period)
          if (slot === 1 || slot === 5 || slot === 6) {
            violations.push({
              constraintType: 'single_offering_peak',
              penalty: c.penalty,
              detail: `${courseId}: single offering at slot ${slot} (1/5/6 discouraged)`,
            })
          }
        }
        break
      }
      case 'two_section_same_block': {
        // For a course with exactly two sections, back-to-back sections within
        // the same double-period block (M1+M2, M3+M4, M5+M6) are discouraged.
        // Spanning two blocks (M2+M3) is fine. Double blocks: {1,2},{3,4},{5,6}.
        const inSameBlock = (a: number, b: number): boolean =>
          Math.abs(a - b) === 1 && Math.floor((a - 1) / 2) === Math.floor((b - 1) / 2)
        for (const [courseId, list] of byCourse) {
          if (list.length !== 2) continue
          const [x, y] = list.map((a) => slotOf(a.period))
          if (inSameBlock(x, y)) {
            violations.push({
              constraintType: 'two_section_same_block',
              penalty: c.penalty,
              detail: `${courseId}: 2 sections back-to-back in one double block`,
            })
          }
        }
        break
      }
    }
  }

  violations.sort((a, b) => {
    if (a.penalty !== b.penalty) return a.penalty - b.penalty
    return a.constraintType < b.constraintType ? -1 : a.constraintType > b.constraintType ? 1 : 0
  })

  const score = violations.reduce((sum, v) => sum + v.penalty, 0)
  return { violations, score }
}