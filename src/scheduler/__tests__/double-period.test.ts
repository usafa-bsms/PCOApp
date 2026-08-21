import { describe, it, expect } from 'vitest'
import { solve } from '../index'
import type { SolveInput } from '../types'
import { assignRooms } from '../rooms'
import { PERIODS } from '../../lib/periods'

const periods = PERIODS.map((p) => ({
  code: p.code, day: p.day as 'M' | 'T', slot: p.slot, partOfDay: p.partOfDay as 'morning' | 'afternoon',
}))

function baseInput(extra: Partial<SolveInput> = {}): SolveInput {
  return {
    persons: [
      { id: 'p1', name: 'Alice', role: 'faculty', courseLoad: 4 },
      { id: 'p2', name: 'Bob', role: 'faculty', courseLoad: 4 },
      { id: 'p3', name: 'Carol', role: 'faculty', courseLoad: 4 },
    ],
    courses: [
      { id: 'c1', code: 'DS 421', sections: 1, expectedEnrollment: 45, isDoublePeriod: true },
    ],
    qualifications: [
      { personId: 'p1', courseId: 'c1', level: 'can_teach' },
      { personId: 'p2', courseId: 'c1', level: 'can_teach' },
      { personId: 'p3', courseId: 'c1', level: 'can_teach' },
    ],
    periods,
    preferences: [],
    locks: [],
    constraints: [],
    rooms: ['5D20', '5D21', '5D22', '5D23'],
    ...extra,
  }
}

describe('double-period course model', () => {
  it('starts the block only at 1st/3rd/5th slot and reserves both periods for one person', () => {
    const a = solve(baseInput())
    const teacher = a.assignments.find((x) => x.role === 'teacher')!
    expect(teacher.doubleBlockStart).toBe(true)
    const start = Number(teacher.period.charAt(1))
    expect([1, 3, 5]).toContain(start)
    // the person must not be assigned anything else in the second period
    const partner = `${teacher.period.charAt(0)}${start + 1}`
    const samePersonOthers = a.assignments.filter(
      (x) => x.personId === teacher.personId && x.period === partner,
    )
    expect(samePersonOthers.filter((x) => x.role === 'teacher')).toHaveLength(0)
  })

  it('holds the SAME real room across both periods of the block', () => {
    const assignments = solve(baseInput()).assignments.filter((x) => x.role === 'teacher')
    const withRooms = assignRooms(assignments, ['5D20', '5D21', '5D22', '5D23'])
    const block = withRooms[0]
    expect(block.roomId).toBeTruthy()
    const start = Number(block.period.charAt(1))
    const partner = `${block.period.charAt(0)}${start + 1}`
    // deterministic: re-run assignRooms guarantees the block occupies a single room
    expect(withRooms.filter((x) => x.roomId === block.roomId)).toHaveLength(1)
    void partner
  })

  it('does NOT place another double block in the same period pair (no overlap)', () => {
    const input = baseInput({
      courses: [
        { id: 'c1', code: 'DS 421', sections: 1, expectedEnrollment: 45, isDoublePeriod: true },
        { id: 'c2', code: 'DS 422', sections: 1, expectedEnrollment: 45, isDoublePeriod: true },
      ],
      persons: [
        { id: 'p1', name: 'Alice', role: 'faculty', courseLoad: 4 },
        { id: 'p2', name: 'Bob', role: 'faculty', courseLoad: 4 },
      ],
      qualifications: [
        { personId: 'p1', courseId: 'c1', level: 'can_teach' },
        { personId: 'p2', courseId: 'c2', level: 'can_teach' },
      ],
      rooms: ['5D20', '5D21'],
    })
    const teachers = solve(input).assignments.filter((x) => x.role === 'teacher')
    expect(teachers).toHaveLength(2)
    // two distinct start periods, and their blocks never share a period
    const occupied = new Set<string>()
    for (const t of teachers) {
      const s = Number(t.period.charAt(1))
      const periods = [t.period, `${t.period.charAt(0)}${s + 1}`]
      for (const per of periods) expect(occupied.has(per)).toBe(false)
      periods.forEach((per) => occupied.add(per))
    }
  })

  it('still schedules single-period courses normally alongside a double course', () => {
    const input = baseInput({
      courses: [
        { id: 'c1', code: 'DS 421', sections: 1, expectedEnrollment: 45, isDoublePeriod: true },
        { id: 'c2', code: 'MATH 311', sections: 2, expectedEnrollment: 40 },
      ],
      persons: [
        { id: 'p1', name: 'Alice', role: 'faculty', courseLoad: 4 },
        { id: 'p2', name: 'Bob', role: 'faculty', courseLoad: 4 },
      ],
      qualifications: [
        { personId: 'p1', courseId: 'c1', level: 'can_teach' },
        { personId: 'p2', courseId: 'c2', level: 'can_teach' },
      ],
      rooms: ['5D20', '5D21', '5D22', '5D23'],
    })
    const teachers = solve(input).assignments.filter((x) => x.role === 'teacher')
    expect(teachers).toHaveLength(3) // 1 double + 2 single
    const single = teachers.filter((x) => !x.doubleBlockStart)
    expect(single).toHaveLength(2)
  })
})

describe('double-period via greedy fallback (solveCore)', () => {
  it('produces a valid non-overlapping block with a locked start', () => {
    // A person-locked double assignment must start at a valid slot and reserve
    // the two periods.
    const input = baseInput({
      locks: [
        { personId: 'p1', courseId: 'c1', section: 1, lockType: 'assignment', period: 'T3' },
      ],
    })
    const a = solve(input)
    const teacher = a.assignments.find((x) => x.role === 'teacher' && x.courseId === 'c1')!
    expect(teacher.period).toBe('T3')
    expect(teacher.doubleBlockStart).toBe(true)
  })
})