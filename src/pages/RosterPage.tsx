import { useEffect, useState } from 'react'
import { useSemester } from '../context/SemesterContext'
import { addPerson, deletePerson, fetchPersons, updatePerson } from '../lib/api'
import type { Person } from '../lib/db-types'
import { DEFAULT_COURSE_LOAD, type Role } from '../lib/rbac'
import { Crud, ErrorBox, useAsyncError } from './Crud'

const ROLES: Role[] = ['faculty', 'new_instructor', 'academic_director', 'lead_admin']

export function RosterPage() {
  const { active } = useSemester()
  const { error, run } = useAsyncError()
  const [people, setPeople] = useState<Person[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('faculty')
  const [loadVal, setLoadVal] = useState(3)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')

  async function load() {
    if (!active) return
    setPeople(await fetchPersons(active.id) ?? [])
  }

  useEffect(() => { void load() }, [active?.id])

  async function onAdd() {
    if (!active || !name.trim()) return
    const ok = await run(() => addPerson({
      semesterId: active.id, name: name.trim(), email: email.trim(),
      role, courseLoad: loadVal,
    }))
    if (ok === undefined) return
    setName(''); setEmail(''); setRole('faculty'); setLoadVal(role === 'new_instructor' ? 4 : 3)
    await load()
  }

  async function onSaveEdit(personId: string) {
    const ok = await run(() => updatePerson(personId, {
      name: editName.trim(), email: editEmail.trim(),
    }))
    if (ok === undefined) return
    setEditId(null)
    await load()
  }

  function startEdit(p: Person) {
    setEditId(p.id)
    setEditName(p.name)
    setEditEmail(p.email)
  }

  return (
    <Crud title="Roster" note={`${people.length} instructors in ${active?.name ?? 'the active semester'}.`}>
      <ErrorBox error={error} />

      <table className="table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Load</th><th></th></tr></thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id}>
              <td>
                {editId === p.id
                  ? <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  : p.name}
              </td>
              <td>
                {editId === p.id
                  ? <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                  : p.email}
              </td>
              <td>
                <select
                  value={p.role}
                  onChange={(e) => {
                    const r = e.target.value as Role
                    void run(async () => { await updatePerson(p.id, { role: r }); await load() })
                  }}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </td>
              <td>
                <input
                  type="number"
                  min={0}
                  value={p.course_load}
                  style={{ width: 60 }}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    void run(async () => { await updatePerson(p.id, { course_load: v }); await load() })
                  }}
                />
              </td>
              <td>
                {editId === p.id ? (
                  <>
                    <button onClick={() => void onSaveEdit(p.id)}>Save</button>
                    <button className="secondary" onClick={() => setEditId(null)}>Cancel</button>
                  </>
                ) : (
                  <button className="secondary" onClick={() => startEdit(p)}>Edit</button>
                )}
                <button className="danger" onClick={() => void run(async () => { await deletePerson(p.id); await load() })}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {people.length === 0 && <tr><td colSpan={5} className="muted">No instructors yet.</td></tr>}
        </tbody>
      </table>

      <h3>Add instructor</h3>
      <div className="grid">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select value={role} onChange={(e) => { const r = e.target.value as Role; setRole(r); setLoadVal(DEFAULT_COURSE_LOAD[r]) }}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input type="number" min={0} value={loadVal} onChange={(e) => setLoadVal(Number(e.target.value))} title="Course load" />
        <button onClick={() => void onAdd()}>Add</button>
      </div>
    </Crud>
  )
}