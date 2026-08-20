import { useEffect, useState } from 'react'
import { useSemester } from '../context/SemesterContext'
import { useAuth } from '../context/AuthContext'
import {
  createScheduleRun,
  fetchClassrooms,
  fetchConstraints,
  fetchCourses,
  fetchLocks,
  fetchPeriods,
  fetchPersons,
  fetchPreferences,
  fetchQualifications,
  fetchScheduleRuns,
  insertScheduleAssignments,
} from '../lib/api'
import type { Course, DbPeriod, Person, ScheduleRun } from '../lib/db-types'
import { assignmentsToRows, buildSolveInput } from '../lib/schedule'
import { solve, type SolveResult, type Violation } from '../scheduler'
import { isAtLeast } from '../lib/rbac'
import { Crud, ErrorBox, useAsyncError } from './Crud'

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
  const [saved, setSaved] = useState<number | null>(null)
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

  const periodByCode = new Map(periods.map((p) => [p.code, p.id]))
  const courseName = new Map(courses.map((c) => [c.id, c.code]))
  const personName = new Map(people.map((p) => [p.id, p.name]))
  const roomName = new Map(rooms.map((r) => [r.id, r.name]))

  function sortedViolations(): Violation[] {
    return result ? [...result.violations] : []
  }

  function humanize(detail: string): string {
    return detail.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      (m) => personName.get(m) ?? courseName.get(m) ?? m,
    )
  }
  function sortedAssignments() {
    if (!result) return []
    return [...result.assignments].sort(
      (a, b) =>
        (courseName.get(a.courseId) ?? '').localeCompare(courseName.get(b.courseId) ?? '') ||
        a.section - b.section
    )
  }

  async function onRun() {
    if (!active || !user) return
    setBusy(true)
    setSaved(null)
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

      // persist (AD/lead guarded by RLS); fall back to any AD/lead persona for
      // attribution if the current user lacks a linked persona this run
      const roster = persons ?? []
      const myPerson = roster.find((p) => p.auth_user_id === user.id)
      const createdBy = myPerson?.id
        ?? roster.find((p) => (p.role === 'academic_director' || p.role === 'lead_admin'))?.id
        ?? roster[0]?.id
      if (!createdBy) throw new Error('No roster persona available to attribute this schedule run.')
      const runId = await createScheduleRun({
        semesterId: active.id,
        createdBy,
        score: solved.score,
      })
      const rows = assignmentsToRows(solved.assignments, runId, periodByCode)
      await insertScheduleAssignments(rows)
      setSaved(rows.length)
      setRuns(await fetchScheduleRuns(active.id))
    })
    setBusy(false)
  }

  return (
    <Crud
      title="Schedule"
      note={`${runs.length} saved run(s) in ${active?.name ?? 'the active semester'}. ${isAD ? '' : 'Only an Academic Director / Lead Admin can run & persist.'}`}
    >
      <ErrorBox error={error} />
      <p>
        <button disabled={busy || !isAD} onClick={() => void onRun()}>
          {busy ? 'Running…' : 'Run & save schedule'}
        </button>
        {saved !== null && <span className="muted"> Saved {saved} assignment(s).</span>}
      </p>

      {result && (
        <>
          <p>
            Score: <strong>{result.score}</strong> · {result.assignments.length} sections ·{' '}
            {result.violations.length} constraint violation(s).
          </p>

          {result.violations.length > 0 && (
            <>
              <h3>Constraint violations</h3>
              <table className="table">
                <thead><tr><th>Type</th><th>Penalty</th><th>Detail</th></tr></thead>
                <tbody>
                  {sortedViolations().map((v, i) => (
                    <tr key={i}><td>{v.constraintType}</td><td>{v.penalty}</td><td>{humanize(v.detail)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3>Assignments</h3>
          <div className="scroll">
            <table className="table">
              <thead><tr><th>Course</th><th>Sec</th><th>Instructor</th><th>Period</th><th>Room</th><th>Role</th></tr></thead>
              <tbody>
                {sortedAssignments().map((a, i) => (
                  <tr key={i}>
                    <td>{courseName.get(a.courseId) ?? a.courseId}</td>
                    <td>{a.section}</td>
                    <td>{personName.get(a.personId) ?? a.personId}</td>
                    <td>{a.period || '—'}</td>
                    <td>{a.roomId ? roomName.get(a.roomId) ?? a.roomId : '—'}</td>
                    <td>{a.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Crud>
  )
}