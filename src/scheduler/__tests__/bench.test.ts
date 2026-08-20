import { describe, it, expect } from 'vitest'
import { solve } from '../index'
import { solveCore } from '../solver'
import { evaluateConstraints } from '../constraints'
import { CONSTRAINT_DEFAULTS } from '../../lib/api'
import type { SolveInput, Constraint } from '../types'
import fixture from './fixtures/fall2026.json'

// The CP search must outperform the greedy seed on the fixture (with the same
// soft-constraint penalties the app seeds), and stay deterministic.
describe('solver quality vs greedy', () => {
  const fx = fixture as unknown as {
    persons: { id: string; name: string; role: string; courseLoad: number }[]
    courses: { id: string; code: string; sections: number }[]
    periods: { code: string; day: 'M' | 'T'; slot: number; partOfDay: string }[]
    qualifications: { personId: string; courseId: string; level: string }[]
    rooms: string[]
  }

  function buildDefaultInput(): SolveInput {
    return {
      persons: fx.persons.map((p) => ({ id: p.id, name: p.name, role: 'faculty' as const, courseLoad: p.courseLoad })),
      courses: fx.courses.map((c) => ({ id: c.id, code: c.code, sections: c.sections, expectedEnrollment: 0 })),
      periods: fx.periods.map((p) => ({ code: p.code, day: p.day as 'M' | 'T', slot: p.slot, partOfDay: p.partOfDay as 'morning' | 'afternoon' })),
      qualifications: fx.qualifications.map((q) => ({ personId: q.personId, courseId: q.courseId, level: 'can_teach' as const })),
      preferences: [],
      locks: [],
      rooms: fx.rooms,
      constraints: CONSTRAINT_DEFAULTS.map((c) => ({ type: c.type as Constraint['type'], penalty: c.penalty, params: c.params })),
    }
  }

  it('CP search scores lower than the greedy seed', () => {
    const input = buildDefaultInput()
    const greedy = evaluateConstraints(solveCore(input).assignments, input.constraints)
    const cp = solve(input)
    expect(cp.violations.length).toBeLessThan(greedy.violations.length)
    expect(cp.score).toBeLessThan(greedy.score)
    expect(cp.score).toBeGreaterThanOrEqual(0)
  })

  it('remains deterministic and places every section', () => {
    const a = solve(buildDefaultInput())
    const b = solve(buildDefaultInput())
    expect(a).toEqual(b)
    const teachers = a.assignments.filter((x) => x.role === 'teacher')
    expect(teachers).toHaveLength(116)
  })
})