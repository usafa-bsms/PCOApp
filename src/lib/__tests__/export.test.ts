import { describe, it, expect } from 'vitest'
import type { ScheduleAssignment } from '../db-types'
import {
  buildCourseView,
  buildTeacherView,
  buildPcoRows,
  buildWorkbook,
  toArrayOfArrays,
  type ExportContext,
} from '../export'

function ctx(over: Partial<ExportContext> = {}): ExportContext {
  return {
    courseCode: new Map([
      ['c1', 'Math 141'],
      ['c2', 'Data Sci 220'],
    ]),
    courseEnrollment: new Map([
      ['c1', 250],
      ['c2', 63],
    ]),
    personName: new Map([
      ['p1', 'Davis, Evelyn'],
      ['p2', 'Yates, Don'],
    ]),
    periodCode: new Map([
      ['per-m1', 'M1'],
      ['per-m2', 'M2'],
      ['per-t3', 'T3'],
    ]),
    roomName: new Map([
      ['r5d10', '5D10'],
      ['r5f2', '5F2'],
    ]),
    ...over,
  }
}

function asg(
  course_id: string,
  person_id: string,
  period_id: string,
  section: number,
  room_id: string | null = null,
  role: 'director' | 'teacher' = 'teacher',
): ScheduleAssignment {
  return { run_id: 'run1', course_id, person_id, section, period_id, room_id, role }
}

const assignments: ScheduleAssignment[] = [
  asg('c1', 'p1', 'per-m1', 1, 'r5d10'),
  asg('c1', 'p2', 'per-m1', 2, 'r5f2'),
  asg('c2', 'p1', 'per-t3', 1, 'r5d10'),
]

describe('buildCourseView', () => {
  it('groups by course code then section and maps ids to names', () => {
    const rows = buildCourseView(assignments, ctx())
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.Course)).toEqual(['Data Sci 220', 'Math 141', 'Math 141'])
    expect(rows[0]).toEqual({
      Course: 'Data Sci 220',
      Section: 1,
      Instructor: 'Davis, Evelyn',
      Period: 'T3',
      Room: '5D10',
      Role: 'teacher',
    })
  })
})

describe('buildTeacherView', () => {
  it('groups by instructor name', () => {
    const rows = buildTeacherView(assignments, ctx())
    const instructorCol = rows.map((r) => r.Instructor)
    expect(instructorCol).toEqual(['Davis, Evelyn', 'Davis, Evelyn', 'Yates, Don'])
  })
})

describe('buildPcoRows', () => {
  it('assigns distinct period letters to concurrent sections and emits PCO columns', () => {
    const rows = buildPcoRows(assignments, ctx())
    expect(rows).toHaveLength(3)
    const byCourse = rows.map((r) => r['Course/Number'])
    expect(byCourse).toEqual(['Data Sci 220', 'Math 141', 'Math 141'])
    // Math 141 has two M1 sections -> letters A, B
    const math141 = rows.filter((r) => r['Course/Number'] === 'Math 141')
    expect(math141[0]['Class Section (M1A, T3B, etc)']).toBe('M1A')
    expect(math141[1]['Class Section (M1A, T3B, etc)']).toBe('M1B')
    // Single-slot course keeps its bare period
    expect(rows.find((r) => r['Course/Number'] === 'Data Sci 220')!['Class Section (M1A, T3B, etc)']).toBe('T3A')
    expect(rows[0]['Department']).toBe('DFMS')
    expect(rows[0]['Start Time']).toBe(930)
    expect(rows[0]['M or T section (M or T)']).toBe('T')
    expect(rows[0]['Select Pattern']).toBe('T1=T-day single period')
    expect(rows[0]['Exam Type (Essay, Exam)']).toBe('Exam')
    expect(rows[0]['Section Cap']).toBe(Math.round(63 / 1))
  })

  it('uses double-period select pattern when a course is flagged', () => {
    const rows = buildPcoRows(
      [assignments[2]],
      ctx(),
      (id) => id === 'c2',
    )
    expect(rows[0]['Select Pattern']).toBe('T2=T-day double period')
  })

  it('renders NONE for rooms that are not present', () => {
    const rows = buildPcoRows([asg('c1', 'p1', 'per-m1', 1)], ctx())
    expect(rows[0]['Facility ID/Room']).toBe('NONE')
  })
})

describe('toArrayOfArrays / buildWorkbook', () => {
  it('produces header + rows', () => {
    const aoa = toArrayOfArrays([{ A: 1, B: 'x' }, { A: 2, B: 'y' }])
    expect(aoa).toEqual([
      ['A', 'B'],
      [1, 'x'],
      [2, 'y'],
    ])
  })

  it('builds a workbook whose sheet contains the rows', () => {
    const wb = buildWorkbook('Sched', buildCourseView(assignments, ctx()))
    expect(wb.SheetNames).toEqual(['Sched'])
    const sheet = wb.Sheets['Sched']
    expect(sheet['A1'].v).toBe('Course')
    expect(sheet['!ref']).toBe('A1:F4')
  })
})