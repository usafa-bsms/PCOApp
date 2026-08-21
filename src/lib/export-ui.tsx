import { useState } from 'react'
import type { ExportContext, ExportRow } from './export'

export type ExportViewKind = 'course' | 'teacher'

interface ExportButtonsProps {
  exportAssignments: ExportRow[]
  /** courseId -> course code */
  courseCode: Map<string, string>
  /** courseId -> expected enrollment */
  courseEnrollment: Map<string, number>
  /** personId -> instructor display name */
  personName: Map<string, string>
  /** periodId -> period code */
  periodCode: Map<string, string>
  /** roomId -> room name */
  roomName: Map<string, string>
  /** courseId -> is double period */
  isDouble: Map<string, boolean>
  department?: string
  baseFilename?: string
}

/**
 * Lazy export UI. Imports the SheetJS-backed export module on first click so the
 * heavy xlsx runtime stays out of the initial bundle.
 */
export function ExportButtons(props: ExportButtonsProps) {
  const [busy, setBusy] = useState(false)

  async function runExport(fn: () => Promise<void>) {
    if (props.exportAssignments.length === 0) return
    setBusy(true)
    try {
      await import('./export') // code-split: loads the SheetJS runtime on demand
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const ctx = (): ExportContext => ({
    courseCode: props.courseCode,
    courseEnrollment: props.courseEnrollment,
    personName: props.personName,
    periodCode: props.periodCode,
    roomName: props.roomName,
    department: props.department ?? 'DFMS',
  })

  async function exportCsv(kind: ExportViewKind) {
    const m = await import('./export')
    const base = props.baseFilename ?? 'schedule'
    const c = ctx()
    const rows = kind === 'course'
      ? m.buildCourseView(props.exportAssignments, c)
      : m.buildTeacherView(props.exportAssignments, c)
    m.downloadCsv(`${base}-${kind}.csv`, rows)
  }

  async function exportPco() {
    const m = await import('./export')
    const base = props.baseFilename ?? 'PCO-schedule'
    const rows = m.buildPcoRows(props.exportAssignments, ctx(), (id) => props.isDouble.get(id) ?? false)
    m.downloadWorkbook(`${base}.xlsx`, m.buildWorkbook(base, rows))
  }

  return (
    <span>
      <button
        className="secondary"
        disabled={busy || props.exportAssignments.length === 0}
        onClick={() => void runExport(() => exportCsv('course'))}
      >CSV · by course</button>{' '}
      <button
        className="secondary"
        disabled={busy || props.exportAssignments.length === 0}
        onClick={() => void runExport(() => exportCsv('teacher'))}
      >CSV · by teacher</button>{' '}
      <button
        className="secondary"
        disabled={busy || props.exportAssignments.length === 0}
        onClick={() => void runExport(() => exportPco())}
      >PCO xlsx</button>
    </span>
  )
}