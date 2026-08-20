import { useEffect, useState } from 'react'
import { useSemester } from '../context/SemesterContext'
import {
  createClassroom,
  deleteClassroom,
  fetchClassrooms,
  updateClassroom,
} from '../lib/api'
import type { Classroom } from '../lib/db-types'
import { Crud, ErrorBox, useAsyncError } from './Crud'

export function ClassroomsPage() {
  const { active } = useSemester()
  const { error, run } = useAsyncError()
  const [rooms, setRooms] = useState<Classroom[]>([])
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState(23)
  const [assignable, setAssignable] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCap, setEditCap] = useState(0)
  const [editAssignable, setEditAssignable] = useState(true)

  async function load() {
    if (!active) return
    setRooms(await fetchClassrooms(active.id))
  }

  useEffect(() => { void load() }, [active?.id])

  async function onAdd() {
    if (!active || !name.trim()) return
    const ok = await run(() => createClassroom({
      semesterId: active.id,
      name: name.trim(),
      capacity,
      assignable,
    }))
    if (ok === undefined) return
    setName(''); setCapacity(23); setAssignable(true)
    await load()
  }

  async function onSaveEdit(roomId: string) {
    const ok = await run(() => updateClassroom(roomId, {
      name: editName.trim(),
      capacity: editCap,
      assignable: editAssignable,
    }))
    if (ok === undefined) return
    setEditId(null)
    await load()
  }

  function startEdit(r: Classroom) {
    setEditId(r.id)
    setEditName(r.name)
    setEditCap(r.capacity)
    setEditAssignable(r.assignable)
  }

  const assignableCount = rooms.filter((r) => r.assignable).length

  return (
    <Crud title="Rooms" note={`${rooms.length} rooms in ${active?.name ?? 'the active semester'} (${assignableCount} assignable by the scheduler).`}>
      <ErrorBox error={error} />
      <p className="muted">
        Assignable rooms are candidates the scheduler may place sections into. A room with
        "Assignable" turned off is a placeholder or a "NONE" room that the algorithm will never use.
      </p>

      <table className="table">
        <thead><tr><th>Name</th><th>Capacity</th><th>Assignable</th><th></th></tr></thead>
        <tbody>
          {rooms.map((r) => (
            <tr key={r.id}>
              <td>
                {editId === r.id
                  ? <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  : r.name}
              </td>
              <td>
                {editId === r.id
                  ? <input type="number" min={1} value={editCap} style={{ width: 70 }} onChange={(e) => setEditCap(Number(e.target.value))} />
                  : r.capacity}
              </td>
              <td>
                {editId === r.id
                  ? <input type="checkbox" checked={editAssignable} onChange={(e) => setEditAssignable(e.target.checked)} />
                  : (r.assignable ? 'Yes' : 'No')}
              </td>
              <td>
                {editId === r.id ? (
                  <>
                    <button onClick={() => void onSaveEdit(r.id)}>Save</button>
                    <button className="secondary" onClick={() => setEditId(null)}>Cancel</button>
                  </>
                ) : (
                  <button className="secondary" onClick={() => startEdit(r)}>Edit</button>
                )}
                <button className="danger" onClick={() => void run(async () => { await deleteClassroom(r.id); await load() })}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {rooms.length === 0 && <tr><td colSpan={4} className="muted">No rooms yet.</td></tr>}
        </tbody>
      </table>

      <h3>Add room</h3>
      <div className="grid">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} title="Capacity" />
        <label className="check"><input type="checkbox" checked={assignable} onChange={(e) => setAssignable(e.target.checked)} /> Assignable</label>
        <button onClick={() => void onAdd()}>Add</button>
      </div>
    </Crud>
  )
}