import * as XLSX from 'xlsx'
import type { Day } from './periods'

/** Structural subset of a schedule row the export uses; works for saved-run rows
 * (ExportRow) and reconstructed in-page results alike. */
export interface ExportRow {
  course_id: string
  person_id: string
  period_id: string
  room_id: string | null
  section: number
  role?: 'director' | 'teacher' | string
}

export interface ExportContext {
  /** courseId -> course code, e.g. "Math 141" */
  courseCode: Map<string, string>
  /** courseId -> expected enrollment (used to estimate section caps) */
  courseEnrollment: Map<string, number>
  /** personId -> instructor name (dotted display name) */
  personName: Map<string, string>
  /** periodId -> canonical period code, e.g. "T3" */
  periodCode: Map<string, string>
  /** roomId -> room name; absent means "NONE" / no room */
  roomName: Map<string, string>
  /** user's department label for the Dept column; defaults to "DFMS" */
  department?: string
}

export interface PcoRow {
  Department: string
  'Course/Number': string
  Session: string
  'Section Cap': number
  'Class Section (M1A, T3B, etc)': string
  'Associated Class (first section is 1)': number
  'Facility ID/Room': string
  'Select Pattern': string
  'Start Time': number
  'M or T section (M or T)': Day
  'Instructor (Last Name, First Name)': string
  'Exam Type (Essay, Exam)': string
}

/** Slot -> wall-clock start time in 24h HHMM, per the reference PCO workbook. */
const START_TIME: Record<number, number> = { 1: 730, 2: 830, 3: 930, 4: 1030, 5: 1330, 6: 1430 }

/**
 * Choose the reference "Select Pattern" label. Constant per type (single M / single
 * T / double), matching the reference workbook's non-slot-specific descriptors.
 */
function selectPattern(day: Day, isDoublePeriod: boolean): string {
  if (isDoublePeriod) return day === 'T' ? 'T2=T-day double period' : 'M2=M-day double period'
  return day === 'T' ? 'T1=T-day single period' : 'M1=M-day single period'
}

/** Deterministic canonical ordering: course code, then section, then period. */
function byCourseThenSection(
  a: ExportRow,
  b: ExportRow,
  ctx: ExportContext,
): number {
  return (
    (ctx.courseCode.get(a.course_id) ?? '').localeCompare(ctx.courseCode.get(b.course_id) ?? '') ||
    a.section - b.section ||
    (ctx.periodCode.get(a.period_id) ?? '').localeCompare(ctx.periodCode.get(b.period_id) ?? '')
  )
}

export interface CourseViewRow {
  Course: string
  Section: number
  Instructor: string
  Period: string
  Room: string
  Role: string
}

export interface TeacherViewRow {
  Instructor: string
  Course: string
  Section: number
  Period: string
  Room: string
  Role: string
}

/**
 * The primary "course view": one row per assignment grouped by course code.
 * Columns mirror the Schedule page table (course, section, instructor, period,
 * room, role).
 */
export function buildCourseView(
  assignments: ExportRow[],
  ctx: ExportContext,
): CourseViewRow[] {
  return [...assignments]
    .sort((a, b) => byCourseThenSection(a, b, ctx))
    .map((a) => ({
      Course: ctx.courseCode.get(a.course_id) ?? a.course_id,
      Section: a.section,
      Instructor: ctx.personName.get(a.person_id) ?? a.person_id,
      Period: ctx.periodCode.get(a.period_id) ?? a.period_id,
      Room: a.room_id ? ctx.roomName.get(a.room_id) ?? a.room_id : 'NONE',
      Role: a.role ?? 'teacher',
    }))
}

/**
 * The "teacher view": one row per assignment grouped by instructor, so a teacher
 * finds their own name and sees what they teach when/where.
 */
export function buildTeacherView(
  assignments: ExportRow[],
  ctx: ExportContext,
): TeacherViewRow[] {
  return [...assignments]
    .sort(
      (a, b) =>
        (ctx.personName.get(a.person_id) ?? '').localeCompare(ctx.personName.get(b.person_id) ?? '') ||
        byCourseThenSection(a, b, ctx),
    )
    .map((a) => ({
      Instructor: ctx.personName.get(a.person_id) ?? a.person_id,
      Course: ctx.courseCode.get(a.course_id) ?? a.course_id,
      Section: a.section,
      Period: ctx.periodCode.get(a.period_id) ?? a.period_id,
      Room: a.room_id ? ctx.roomName.get(a.room_id) ?? a.room_id : 'NONE',
      Role: a.role ?? 'teacher',
    }))
}

function sectionCount(assignments: ExportRow[], courseId: string): number {
  return assignments.filter((a) => a.course_id === courseId).length
}

/**
 * The special PCO workbook layout from `Inputs/DFMS_PCO_F26_V7.xlsx`.
 *
 * Letters (`M1A`, `T3B`, …) distinguish concurrent sections sharing a period;
 * they are assigned among same-period assignments ordered by course then section.
 * `Associated Class` is the course-level section number. Section caps are
 * estimated from a course's expected enrollment (the DB stores a course-level
 * enrollment, not per-section caps); callers may override `capFor`.
 */
export function buildPcoRows(
  assignments: ExportRow[],
  ctx: ExportContext,
  isDoublePeriod: (courseId: string) => boolean = () => false,
  capFor: (courseId: string) => number = (id) =>
    Math.round((ctx.courseEnrollment.get(id) ?? 0) / Math.max(1, sectionCount(assignments, id))),
): PcoRow[] {
  // Letter assignment: group by period, order courses canonically, tick a letter.
  const order = [...assignments].sort((a, b) => byCourseThenSection(a, b, ctx))
  const letterCursor = new Map<string, number>() // period -> next letter index
  const letterOf = new Map<string, string>() // `${courseId}:${section}:${period}` -> letter

  for (const a of order) {
    const period = ctx.periodCode.get(a.period_id) ?? ''
    if (!period) continue
    const i = letterCursor.get(period) ?? 0
    letterCursor.set(period, i + 1)
    letterOf.set(afterKey(a, ctx), String.fromCharCode(65 + i))
  }

  const keyFor = (a: ExportRow): string => afterKey(a, ctx)

  return assignments
    .filter((a) => ctx.periodCode.has(a.period_id))
    .sort((a, b) => byCourseThenSection(a, b, ctx))
    .map((a) => {
      const period = ctx.periodCode.get(a.period_id)!
      const day = period[0] as Day
      const slot = Number(period[1])
      const letter = letterOf.get(keyFor(a)) ?? ''
      const room = a.room_id ? ctx.roomName.get(a.room_id) ?? a.room_id : 'NONE'
      return {
        Department: ctx.department ?? 'DFMS',
        'Course/Number': ctx.courseCode.get(a.course_id) ?? a.course_id,
        Session: 'Regular 40 Lessons',
        'Section Cap': capFor(a.course_id),
        'Class Section (M1A, T3B, etc)': letter ? `${period}${letter}` : period,
        'Associated Class (first section is 1)': a.section,
        'Facility ID/Room': room,
        'Select Pattern': selectPattern(day, isDoublePeriod(a.course_id)),
        'Start Time': START_TIME[slot] ?? 0,
        'M or T section (M or T)': day,
        'Instructor (Last Name, First Name)': ctx.personName.get(a.person_id) ?? a.person_id,
        'Exam Type (Essay, Exam)': 'Exam',
      }
    })
}

function afterKey(a: ExportRow, ctx: ExportContext): string {
  return `${ctx.courseCode.get(a.course_id) ?? ''}:${a.section}:${ctx.periodCode.get(a.period_id) ?? ''}`
}

/** Serialize header + rows into an array-of-arrays for SheetJS. */
export function toArrayOfArrays<T extends object>(
  rows: T[],
): (string | number | null)[][] {
  if (rows.length === 0) return []
  const headers = Object.keys(rows[0])
  return [
    headers,
    ...rows.map((r) => {
      const record = r as Record<string, unknown>
      return headers.map((h) => (record[h] === undefined ? null : (record[h] as string | number | null)))
    }),
  ]
}

/** Build a SheetJS workbook object from rows with the given sheet name. */
export function buildWorkbook<T extends object>(sheetName: string, rows: T[]): XLSX.WorkBook {
  const aoa = toArrayOfArrays(rows)
  const sheet = XLSX.utils.aoa_to_sheet(aoa)
  const headers = aoa[0] ?? []
  sheet['!cols'] = headers.map((h) => ({
    wch: h === null ? 16 : Math.min(40, Math.max(12, String(h).length + 2)),
  }))
  return { SheetNames: [sheetName], Sheets: { [sheetName]: sheet } }
}

/** Trigger a browser download of the given rows as a .csv file. */
export function downloadCsv(filename: string, rows: object[]): void {
  if (rows.length === 0) return
  const first = rows[0] as Record<string, unknown>
  const headers = Object.keys(first)
  const escaped = (v: string | number | null): string => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    headers.join(','),
    ...rows.map((r) => {
      const rec = r as Record<string, unknown>
      return headers.map((h) => escaped(rec[h] as string | number | null)).join(',')
    }),
  ]
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Trigger a browser download of a SheetJS workbook as an .xlsx file. */
export function downloadWorkbook(filename: string, workbook: XLSX.WorkBook): void {
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}