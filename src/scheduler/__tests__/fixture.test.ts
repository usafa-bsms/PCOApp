import { describe, it, expect } from 'vitest'
import { solve } from '../index'
import type { SolveInput } from '../types'
import fixture from './fixtures/fall2026.json'

interface Fixture {
  semester: string
  courses: {
    id: string
    code: string
    sections: number
    caps: number[]
    expectedEnrollment: number
  }[]
  persons: { id: string; name: string; role: string; courseLoad: number }[]
  rooms: string[]
  periods: { code: string; day: 'M' | 'T'; slot: number; partOfDay: 'morning' | 'afternoon' }[]
  qualifications: { personId: string; courseId: string; level: string }[]
  groundTruth: {
    courseId: string
    period: string
    sectionLetter: string
    room: string
    personId: string
    cap: number
  }[]
}

const fx = fixture as unknown as Fixture

function toSolveInput(extra: Partial<SolveInput> = {}): SolveInput {
  return {
    persons: fx.persons.map((p) => ({
      id: p.id,
      name: p.name,
      role: 'faculty' as const,
      courseLoad: p.courseLoad,
    })),
    courses: fx.courses.map((c) => ({
      id: c.id,
      code: c.code,
      sections: c.sections,
      expectedEnrollment: c.expectedEnrollment,
    })),
    periods: fx.periods,
    qualifications: fx.qualifications.map((q) => ({
      personId: q.personId,
      courseId: q.courseId,
      level: q.level as 'can_teach',
    })),
    preferences: [],
    locks: [],
    constraints: [],
    rooms: fx.rooms,
    ...extra,
  }
}

describe('Fall 2026 fixture', () => {
  it('has valid, self-consistent fixture data', () => {
    const totalSections = fx.courses.reduce((s, c) => s + c.sections, 0)
    expect(totalSections).toBe(116)
    expect(fx.persons.length).toBeGreaterThan(20)
    expect(fx.rooms.length).toBeGreaterThan(0)
    expect(fx.periods.map((p) => p.code).sort()).toEqual(
      ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6']
    )
  })

  it('places every required section, deterministically', () => {
    const a = solve(toSolveInput())
    const b = solve(toSolveInput())
    expect(a).toEqual(b)

    const teachers = a.assignments.filter((x) => x.role === 'teacher')
    expect(teachers).toHaveLength(116)

    // No two sections of the same person in the same period.
    const keyed = new Set<string>()
    for (const t of teachers) {
      const k = `${t.personId}@${t.period}`
      expect(keyed.has(k)).toBe(false)
      keyed.add(k)
    }
  })

  it('assigns a room to every teaching section without double-booking', () => {
    result: {
      const a = solve(toSolveInput())
      const teachers = a.assignments.filter((x) => x.role === 'teacher')
      for (const t of teachers) {
        expect(t.roomId).toBeTruthy()
      }
      const used = new Map<string, string[]>()
      for (const t of teachers) {
        used.set(t.period, [...(used.get(t.period) ?? []), t.roomId!])
      }
      for (const ls of used.values()) {
        expect(new Set(ls).size).toBe(ls.length) // room unique per period
        expect(ls.length).toBeLessThanOrEqual(fx.rooms.length)
      }
      break result
    }
  })

  it('respects hard course exclusions and locks when present', () => {
    const first = fx.persons[0].id
    const course = fx.courses[0]
    const input = toSolveInput({
      preferences: [
        {
          personId: first,
          kind: 'course',
          courseId: course.id,
          rank: 1,
          isHardExclusion: true,
        },
      ],
      locks: [
        {
          personId: first,
          courseId: course.id,
          lockType: 'assignment',
          period: 'M1',
        },
      ],
    })
    const a = solve(input)
    const teacherRows = a.assignments.filter((x) => x.role === 'teacher')
    expect(teacherRows.some((x) => x.personId === first && x.courseId === course.id)).toBe(true)
    // the forced lock is present exactly once
    const forced = teacherRows.filter((x) => x.personId === first && x.courseId === course.id && x.period === 'M1')
    expect(forced).toHaveLength(1)
  })
})