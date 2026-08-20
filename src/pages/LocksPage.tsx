import { useEffect, useState } from 'react'
import { useSemester } from '../context/SemesterContext'
import {
  addLock,
  deleteLock,
  fetchClassrooms,
  fetchCourses,
  fetchLocks,
  fetchPeriods,
  fetchPersons,
} from '../lib/api'
import type { Classroom, Course, DbPeriod, Lock, Person } from '../lib/db-types'
import { Crud, ErrorBox, useAsyncError } from './Crud'

// Locks are AD/lead-managed (RLS). Person/period/room are each optional; the
// solver keeps what's locked and fills the rest. A course director lock does not
// itself consume a teaching period / count toward load.
export function LocksPage() {
  const { active } = useSemester()
  const { error, run } = useAsyncError()

  const [people, setPeople] = useState<Person[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [periods, setPeriods] = useState<DbPeriod[]>([])
  const [rooms, setRooms] = useState<Classroom[]>([])
  const [locks, setLocks] = useState<Lock[]>([])

  // add form
  const [type, setType] = useState<'course_director' | 'assignment'>('assignment')
  const [courseId, setCourseId] = useState('')
  const [personId, setPersonId] = useState('')
  const [section, setSection] = useState('')
  const [periodId, setPeriodId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [note, setNote] = useState('')

  async function load() {
    if (!active) return
    const [p, c, per, r, l] = await Promise.all([
      fetchPersons(active.id),
      fetchCourses(active.id),
      fetchPeriods(active.id),
      fetchClassrooms(active.id),
      fetchLocks(active.id),
    ])
    setPeople(p ?? [])
    setCourses(c ?? [])
    setPeriods(per ?? [])
    setRooms(r ?? [])
    setLocks(l ?? [])
  }
  useEffect(() => { void load() }, [active?.id])

  function personName(id: string | null): string {
    return id ? people.find((p) => p.id === id)?.name ?? '—' : '—'
  }
  function courseName(id: string): string {
    return courses.find((c) => c.id === id)?.code ?? '—'
  }
  function periodName(id: string | null): string {
    return id ? periods.find((p) => p.id === id)?.code ?? '—' : '—'
  }
  function roomName(id: string | null): string {
    return id ? rooms.find((r) => r.id === id)?.name ?? '—' : '—'
  }

  async function onAdd() {
    if (!active || !courseId) return
    const sec = section.trim() === '' ? null : Number(section)
    const ok = await run(() => addLock({
      semesterId: active.id,
      courseId,
      personId: personId || null,
      section: sec,
      periodId: periodId || null,
      roomId: roomId || null,
      lockType: type,
      note: note.trim() || undefined,
    }))
    if (ok === undefined) return
    setType('assignment'); setCourseId(''); setPersonId(''); setSection(''); setPeriodId(''); setRoomId(''); setNote('')
    await load()
  }

  return (
    <Crud title="Locks" note="Hard choices the solver must respect. Leave a field unset to let the solver fill it.">
      <ErrorBox error={error} />
      <table className="table">
        <thead><tr><th>Type</th><th>Course</th><th>Person</th><th>Section</th><th>Period</th><th>Room</th><th>Note</th><th></th></tr></thead>
        <tbody>
          {locks.map((lk) => (
            <tr key={lk.id}>
              <td>{lk.lock_type}</td>
              <td>{courseName(lk.course_id) || '—'}</td>
              <td>{lk.person_id ? personName(lk.person_id) : '—'}</td>
              <td>{lk.section ?? '—'}</td>
              <td>{periodName(lk.period_id)}</td>
              <td>{roomName(lk.room_id)}</td>
              <td className="muted">{lk.note ?? ''}</td>
              <td>
                <button className="danger" onClick={() => void run(async () => { await deleteLock(lk.id); await load() })}>Remove</button>
              </td>
            </tr>
          ))}
          {locks.length === 0 && <tr><td colSpan={8} className="muted">No locks yet.</td></tr>}
        </tbody>
      </table>

      <h3>Add lock</h3>
      <div className="grid">
        <select value={type} onChange={(e) => setType(e.target.value as 'course_director' | 'assignment')}>
          <option value="assignment">Assignment</option>
          <option value="course_director">Course director</option>
        </select>
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">Course…</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
        </select>
        <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">Person (optional)…</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="number" min={1} placeholder="Section (optional)" value={section} onChange={(e) => setSection(e.target.value)} style={{ width: 120 }} />
        <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
          <option value="">Period (optional)…</option>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
        </select>
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">Room (optional)…</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}{r.assignable ? '' : ' (NONE)'}</option>)}
        </select>
        <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button onClick={() => void onAdd()}>Add</button>
      </div>
    </Crud>
  )
}