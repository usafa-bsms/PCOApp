import type { SolveResult, Assignment, Constraint } from './types'

type ByCourse = Map<string, Assignment[]>

/**
 * Evaluate every soft constraint against the assignments. Deterministic:
 * iteration order is fixed; each constraint type produces a sorted list of
 * Violations so results are reproducible regardless of call sequence.
 */
export function evaluateConstraints(
  assignments: Assignment[],
  constraints: Constraint[]
): { violations: SolveResult['violations']; score: number } {
  const byCourse: ByCourse = new Map()
  for (const a of assignments) {
    const list = byCourse.get(a.courseId)
    if (list) list.push(a)
    else byCourse.set(a.courseId, [a])
  }

  const violations: SolveResult['violations'] = []

  for (const c of constraints) {
    switch (c.type) {
      case 'balance_mt': {
        // Penalize imbalance between M and T totals.
        const m = assignments.filter((a) => a.period.startsWith('M')).length
        const t = assignments.filter((a) => a.period.startsWith('T')).length
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
        const morning = assignments.filter((a) => Number(a.period.slice(1)) <= 3).length
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
        const afternoon = assignments.filter((a) => Number(a.period.slice(1)) >= 4).length
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
        // Large multi-section courses should not all land on the same day.
        for (const [courseId, list] of byCourse) {
          if (list.length < 2) continue
          const m = list.filter((a) => a.period.startsWith('M')).length
          const t = list.filter((a) => a.period.startsWith('T')).length
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
    }
  }

  violations.sort((a, b) => {
    if (a.penalty !== b.penalty) return a.penalty - b.penalty
    return a.constraintType < b.constraintType ? -1 : a.constraintType > b.constraintType ? 1 : 0
  })

  const score = violations.reduce((sum, v) => sum + v.penalty, 0)
  return { violations, score }
}