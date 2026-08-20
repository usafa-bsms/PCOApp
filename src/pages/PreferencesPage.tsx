import { useEffect, useMemo, useState } from 'react'
import { useSemester } from '../context/SemesterContext'
import { useAuth } from '../context/AuthContext'
import {
  addPreference,
  deletePreference,
  fetchCourses,
  fetchPeriods,
  fetchPersons,
  fetchPreferences,
} from '../lib/api'
import type { Course, DbPeriod, Person, Preference } from '../lib/db-types'
import { isAtLeast } from '../lib/rbac'
import { Crud, ErrorBox, useAsyncError } from './Crud'

const RANKS = [1, 2, 3, 4, 5]

/** Preferences are available to every roster member; AD/lead see everyone's and
 *  may clear hard exclusions, faculty only manage their own. */
export function PreferencesPage() {
  const { active } = useSemester()
  const { profile, user } = useAuth()
  const isAD = isAtLeast(profile?.role, 'academic_director')
  const { error, run } = useAsyncError()

  const [people, setPeople] = useState<Person[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [periods, setPeriods] = useState<DbPeriod[]>([])
  const [prefs, setPrefs] = useState<Preference[]>([])

  // add form
  const [personId, setPersonId] = useState('')
  const [kind, setKind] = useState<'course' | 'period'>('course')
  const [courseId, setCourseId] = useState('')
  const [periodId, setPeriodId] = useState('')
  const [rank, setRank] = useState(1)
  const [hard, setHard] = useState(false)

  const myPersonId = useMemo(() => {
    if (!user) return undefined
    const mine = people.find((p) => p.auth_user_id === user.id)
    return mine?.id
  }, [people, user])

  async function load() {
    if (!active) return
    const [p, c, per, pre] = await Promise.all([
      fetchPersons(active.id),
      fetchCourses(active.id),
      fetchPeriods(active.id),
      fetchPreferences(active.id),
    ])
    setPeople(p ?? [])
    setCourses(c ?? [])
    setPeriods(per ?? [])
    setPrefs(pre ?? [])
  }
  useEffect(() => { void load() }, [active?.id])

  // default the add-form person to the logged-in user when not AD
  useEffect(() => {
    if (isAD) return
    if (myPersonId && !personId) setPersonId(myPersonId)
  }, [myPersonId, personId, isAD])

  const shownPeople = isAD ? people : people.filter((p) => p.id === myPersonId)
  const shownPrefs = prefs.filter((p) => shownPeople.some((x) => x.id === p.person_id))

  function labelFor(pref: Preference): string {
    if (pref.kind === 'course') {
      return courses.find((c) => c.id === pref.course_id)?.code ?? '—'
    }
    return periods.find((p) => p.id === pref.period_id)?.code ?? '—'
  }
  function personName(id: string): string {
    return people.find((p) => p.id === id)?.name ?? '—'
  }

  async function onAdd() {
    if (!active) return
    if (kind === 'course' && !courseId) return
    if (kind === 'period' && !periodId) return
    const targetPerson = isAD ? personId : myPersonId
    if (!targetPerson) return
    const ok = await run(() => addPreference({
      personId: targetPerson,
      semesterId: active.id,
      kind,
      courseId: kind === 'course' ? courseId : null,
      periodId: kind === 'period' ? periodId : null,
      rank,
      isHardExclusion: hard,
    }))
    if (ok === undefined) return
    setRank(1); setHard(false)
    await load()
  }

  return (
    <Crud
      title="Preferences"
      note={isAD
        ? 'Course/period likes (lower rank = stronger) and hard exclusions. ADs may edit anyone\'s; exclusions are hard unless an AD removes them.'
        : 'Your course/period likes (lower rank = stronger) and hard exclusions for what you will not teach.'}
    >
      <ErrorBox error={error} />
      <table className="table">
        <thead><tr>{isAD && <th>Instructor</th>}<th>Kind</th><th>Target</th><th>Rank</th><th>Hard exclusion</th><th></th></tr></thead>
        <tbody>
          {shownPrefs.map((pr) => (
            <tr key={pr.id}>
              {isAD && <td>{personName(pr.person_id)}</td>}
              <td>{pr.kind}</td>
              <td>{labelFor(pr)}</td>
              <td>{pr.is_hard_exclusion ? '' : pr.rank}</td>
              <td>{pr.is_hard_exclusion ? 'yes' : ''}</td>
              <td>
                <button className="danger" onClick={() => void run(async () => { await deletePreference(pr.id); await load() })}>Remove</button>
              </td>
            </tr>
          ))}
          {shownPrefs.length === 0 && <tr><td colSpan={isAD ? 6 : 5} className="muted">No preferences yet.</td></tr>}
        </tbody>
      </table>

      <h3>Add preference</h3>
      <div className="grid">
        {isAD && (
          <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">Instructor…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <select value={kind} onChange={(e) => setKind(e.target.value as 'course' | 'period')}>
          <option value="course">Course</option>
          <option value="period">Period</option>
        </select>
        {kind === 'course' ? (
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">Course…</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
        ) : (
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            <option value="">Period…</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
          </select>
        )}
        <select value={rank} onChange={(e) => setRank(Number(e.target.value))}>
          {RANKS.map((r) => <option key={r} value={r}>Rank {r}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={hard} onChange={(e) => setHard(e.target.checked)} /> Hard exclusion</label>
        <button onClick={() => void onAdd()}>Add</button>
      </div>
    </Crud>
  )
}