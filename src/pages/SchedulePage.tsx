import { useEffect, useState } from 'react'
import { useSemester } from '../context/SemesterContext'
import { useAuth } from '../context/AuthContext'
import {
  createScheduleRun,
  deleteScheduleRun,
  fetchClassrooms,
  fetchConstraints,
  fetchCourses,
  fetchLocks,
  fetchPeriods,
  fetchPersons,
  fetchPreferences,
  fetchQualifications,
  fetchScheduleAssignments,
  fetchScheduleRuns,
  insertScheduleAssignments,
} from '../lib/api'
import type { Course, DbPeriod, Person, ScheduleAssignment, ScheduleRun } from '../lib/db-types'
import { assignmentsToRows, buildSolveInput } from '../lib/schedule'
import { solve, type SolveResult } from '../scheduler'
import { isAtLeast } from '../lib/rbac'
import { ExportButtons } from '../lib/export-ui'
import type { ExportContext, ExportRow } from '../lib/export'
import { Crud, ErrorBox, useAsyncError } from './Crud'

interface Row {
  course: string
  section: number
  person: string
  period: string
  room: string
  role: string
}

export function SchedulePage() {
  const { active } = useSemester()
  const { profile, user } = useAuth()
  const isAD = isAtLeast(profile?.role, 'academic_director')
  const { error, run } = useAsyncError()

  const [people, setPeople] = useState<Person[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [periods, setPeriods] = useState<DbPeriod[]>([])
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([])
  const [runs, setRuns] = useState<ScheduleRun[]>([])

  const [result, setResult] = useState<SolveResult | null>(null)
  const [view, setView] = useState<{ run: ScheduleRun; rows: ScheduleAssignment[] } | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!active) return
    const [p, c, per, r, runsList] = await Promise.all([
      fetchPersons(active.id),
      fetchCourses(active.id),
      fetchPeriods(active.id),
      fetchClassrooms(active.id),
      fetchScheduleRuns(active.id),
    ])
    setPeople(p ?? [])
    setCourses(c ?? [])
    setPeriods(per ?? [])
    setRooms((r ?? []).map((x) => ({ id: x.id, name: x.name })))
    setRuns(runsList ?? [])
  }
  useEffect(() => { void load() }, [active?.id])

  const courseName = new Map(courses.map((c) => [c.id, c.code]))
  const personName = new Map(people.map((p) => [p.id, p.name]))
  const roomName = new Map(rooms.map((r) => [r.id, r.name]))
  const periodName = new Map(periods.map((p) => [p.id, p.code]))
  const periodByCode = new Map(periods.map((p) => [p.code, p.id]))

  function humanize(detail: string): string {
    return detail.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      (m) => personName.get(m) ?? courseName.get(m) ?? m,
    )
  }

  function rowsFromResult(): Row[] {
    if (!result) return []
    return [...result.assignments]
      .sort(
        (a, b) =>
          (courseName.get(a.courseId) ?? '').localeCompare(courseName.get(b.courseId) ?? '') ||
          a.section - b.section,
      )
      .map((a) => ({
        course: courseName.get(a.courseId) ?? a.courseId,
        section: a.section,
        person: personName.get(a.personId) ?? a.personId,
        period: a.period || '—',
        room: a.roomId ? roomName.get(a.roomId) ?? a.roomId : '—',
        role: a.role,
      }))
  }

  function rowsFromSaved(): Row[] {
    if (!view) return []
    return [...view.rows].map((a) => ({
      course: courseName.get(a.course_id) ?? a.course_id,
      section: a.section,
      person: personName.get(a.person_id) ?? a.person_id,
      period: periodName.get(a.period_id) ?? a.period_id,
      room: a.room_id ? roomName.get(a.room_id) ?? a.room_id : '—',
      role: a.role,
    }))
  }

  async function onRun() {
    if (!active || !user) return
    setBusy(true)
    setView(null)
    await run(async () => {
      const [persons, courses, quals, per, prefs, locks, cons, classr] = await Promise.all([
        fetchPersons(active.id), fetchCourses(active.id), fetchQualifications(active.id), fetchPeriods(active.id),
        fetchPreferences(active.id), fetchLocks(active.id), fetchConstraints(active.id), fetchClassrooms(active.id),
      ])
      const selections = {
        persons: persons ?? [], courses: courses ?? [], qualifications: quals ?? [],
        periods: per ?? [], preferences: prefs ?? [], locks: locks ?? [],
        constraints: cons ?? [], classrooms: classr ?? [],
      }
      const input = buildSolveInput(selections)
      const solved = solve(input)
      setResult(solved)

      const roster = persons ?? []
      const myPerson = roster.find((p) => p.auth_user_id === user.id)
      const createdBy = myPerson?.id
        ?? roster.find((p) => (p.role === 'academic_director' || p.role === 'lead_admin'))?.id
        ?? roster[0]?.id
      if (!createdBy) throw new Error('No roster persona available to attribute this schedule run.')
      const runId = await createScheduleRun({ semesterId: active.id, createdBy, score: solved.score })
      const rows = assignmentsToRows(solved.assignments, runId, periodByCode)
      await insertScheduleAssignments(rows)
      setRuns(await fetchScheduleRuns(active.id))
    })
    setBusy(false)
  }

  async function onView(sr: ScheduleRun) {
    setResult(null)
    await run(async () => {
      const rows = await fetchScheduleAssignments(sr.id)
      setView({ run: sr, rows })
    })
  }

  async function onDelete(sr: ScheduleRun) {
    await run(async () => {
      await deleteScheduleRun(sr.id)
      if (view?.run.id === sr.id) setView(null)
      setResult(null)
      await load()
    })
  }

  const shownRows = result ? rowsFromResult() : view ? rowsFromSaved() : []
  const shownTitle = result ? 'Latest run' : view ? 'Saved run' : null
  const shownScore = result ? result.score : view?.run.score ?? null

  // Export needs raw schedule rows. For a saved run that's `view.rows`; for an
  // in-page result we reconstruct lightweight rows (no run_id yet).
  const exportAssignments: ExportRow[] =
    view
      ? view.rows
      : (result?.assignments ?? []).map((a) => ({
          course_id: a.courseId,
          person_id: a.personId,
          period_id: periodByCode.get(a.period) ?? a.period,
          room_id: a.roomId ?? null,
          section: a.section,
          role: a.role,
        }))

  const exportCtx: ExportContext = {
    courseCode: courseName,
    courseEnrollment: new Map(courses.map((c) => [c.id, c.expected_enrollment])),
    personName: personName,
    periodCode: periodName,
    roomName,
    department: 'DFMS',
  }
  const isDouble = new Map(courses.map((c) => [c.id, c.is_double_period]))
  const baseFilename = shownTitle
    ? `${shownTitle.replace(/ /g, '-')}-${active?.name?.replace(/ /g, '') ?? 'schedule'}`
    : `PCO-${active?.name?.replace(/ /g, '') ?? 'schedule'}`

  return (
    <Crud
      title="Schedule"
      note={`${runs.length} saved run(s) in ${active?.name ?? 'the active semester'}. ${isAD ? '' : 'Only an Academic Director / Lead Admin can run, view details, or delete.'}`}
    >
      <ErrorBox error={error} />
      <p>
        <button disabled={busy || !isAD} onClick={() => void onRun()}>
          {busy ? 'Running…' : 'Run & save schedule'}
        </button>
      </p>

      {shownTitle && (
        <>
          <h3>{shownTitle}
            {shownScore !== null && <span className="muted"> — score {shownScore}, {shownRows.length} sections</span>}
          </h3>
          <p>
            <span className="muted">Export this run:</span>{' '}
            {exportAssignments.length > 0 && (
              <ExportButtons
                exportAssignments={exportAssignments}
                courseCode={exportCtx.courseCode}
                courseEnrollment={exportCtx.courseEnrollment}
                personName={exportCtx.personName}
                periodCode={exportCtx.periodCode}
                roomName={exportCtx.roomName}
                isDouble={isDouble}
                department={exportCtx.department}
                baseFilename={baseFilename}
              />
            )}
          </p>
          {result && result.violations.length > 0 && (
            <table className="table">
              <thead><tr><th>Type</th><th>Penalty</th><th>Detail</th></tr></thead>
              <tbody>
                {result.violations.map((v, i) => (
                  <tr key={i}><td>{v.constraintType}</td><td>{v.penalty}</td><td>{humanize(v.detail)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {shownRows.length === 0 && <p className="muted">No assignments in this run.</p>}
          {shownRows.length > 0 && (
            <div className="scroll">
              <table className="table">
                <thead><tr><th>Course</th><th>Sec</th><th>Instructor</th><th>Period</th><th>Room</th><th>Role</th></tr></thead>
                <tbody>
                  {shownRows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.course}</td><td>{r.section}</td><td>{r.person}</td>
                      <td>{r.period}</td><td>{r.room}</td><td>{r.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <h3>Saved runs</h3>
      <table className="table">
        <thead><tr><th>Created</th><th>Score</th><th></th></tr></thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.created_at).toLocaleString()}</td>
              <td>{r.score ?? '—'}</td>
              <td>
                <button className="secondary" onClick={() => void onView(r)}>View</button>
                {isAD && (
                  <button className="danger" onClick={() => void onDelete(r)}>Delete</button>
                )}
              </td>
            </tr>
          ))}
          {runs.length === 0 && <tr><td colSpan={3} className="muted">No saved runs yet.</td></tr>}
        </tbody>
      </table>
    </Crud>
  )
}