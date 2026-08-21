import { describe, it, expect } from 'vitest'
import { solve, normalizeInput } from '../index'
import type { SolveInput } from '../types'
import fx from './fixtures/fall2026.json'

const baseInput: SolveInput = {
  persons: [
    { id: 'p1', name: 'Alice', role: 'faculty', courseLoad: 3 },
    { id: 'p2', name: 'Bob', role: 'faculty', courseLoad: 3 },
    { id: 'p3', name: 'Carol', role: 'faculty', courseLoad: 2, label: 'dept head' },
  ],
  courses: [
    { id: 'c1', code: 'MATH 311', sections: 2, expectedEnrollment: 40 },
    { id: 'c2', code: 'MATH 411', sections: 1, expectedEnrollment: 20 },
  ],
  qualifications: [
    { personId: 'p1', courseId: 'c1', level: 'can_teach' },
    { personId: 'p2', courseId: 'c1', level: 'can_teach' },
    { personId: 'p3', courseId: 'c2', level: 'can_direct' },
  ],
  periods: [
    { code: 'M1', day: 'M', slot: 1, partOfDay: 'morning' },
    { code: 'M2', day: 'M', slot: 2, partOfDay: 'morning' },
    { code: 'T1', day: 'T', slot: 1, partOfDay: 'morning' },
    { code: 'T5', day: 'T', slot: 5, partOfDay: 'afternoon' },
  ],
  preferences: [],
  locks: [],
  constraints: [
    { type: 'balance_mt', penalty: 10, params: {} },
    { type: 'morning_min', penalty: 5, params: { min: 3 } },
  ],
}

describe('solver determinism', () => {
  it('produces identical output across runs', () => {
    const a = solve(normalizeInput(baseInput))
    const b = solve(normalizeInput(baseInput))
    expect(a).toEqual(b)
  })

  it('assigns required sections', () => {
    const result = solve(normalizeInput(baseInput))
    // c1 needs 2 sections, c2 needs 1 => 3 total
    expect(result.assignments).toHaveLength(3)
  })

  it('applies hard locks before filling greedily', () => {
    const input: SolveInput = {
      ...baseInput,
      locks: [
        { personId: 'p3', courseId: 'c1', lockType: 'course_director' },
      ],
    }
    const result = solve(normalizeInput(input))
    const director = result.assignments.find((a) => a.role === 'director')
    expect(director?.personId).toBe('p3')
    expect(director?.courseId).toBe('c1')
  })

  it('keeps score >= 0 and reports violations deterministically', () => {
    const result = solve(normalizeInput(baseInput))
    expect(result.score).toBeGreaterThanOrEqual(0)
    const key = JSON.stringify(result.violations)
    expect(JSON.stringify(solve(normalizeInput(baseInput)).violations)).toBe(key)
  })
})

describe('course load target', () => {
  // Total sections equals sum of course loads (116 == 116 on the fixture), so an
  // optimal schedule gives every instructor EXACTLY their courseLoad — no person
  // should be over-target (that was the observed off-by-one: load 4 -> 5 assigned).
  it('respects each instructor courseLoad target on the fixture', () => {
    const f = fx as unknown as {
      persons: { id: string; courseLoad: number }[]
      courses: { id: string; code: string; sections: number; expectedEnrollment: number }[]
      periods: { code: string; day: 'M' | 'T'; slot: number; partOfDay: 'morning' | 'afternoon' }[]
      qualifications: { personId: string; courseId: string; level: string }[]
      rooms: string[]
    }
    const input: SolveInput = {
      persons: f.persons.map((p) => ({ id: p.id, name: p.id, role: 'faculty', courseLoad: p.courseLoad })),
      courses: f.courses.map((c) => ({ id: c.id, code: c.code, sections: c.sections, expectedEnrollment: c.expectedEnrollment })),
      periods: f.periods,
      qualifications: f.qualifications.map((q) => ({ personId: q.personId, courseId: q.courseId, level: q.level as 'can_teach' })),
      preferences: [],
      locks: [],
      constraints: [],
      rooms: f.rooms,
    }
    const result = solve(normalizeInput(input))
    const assigned = new Map<string, number>()
    for (const a of result.assignments) {
      if (a.role === 'teacher') assigned.set(a.personId, (assigned.get(a.personId) ?? 0) + 1)
    }
    for (const p of f.persons) {
      const got = assigned.get(p.id) ?? 0
      expect(got).toBeLessThanOrEqual(p.courseLoad)
    }
  })
})