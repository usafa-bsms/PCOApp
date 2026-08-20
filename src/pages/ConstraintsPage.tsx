import { useEffect, useState } from 'react'
import { useSemester } from '../context/SemesterContext'
import { useAuth } from '../context/AuthContext'
import {
  addConstraint,
  CONSTRAINT_DEFAULTS,
  deleteConstraint,
  fetchConstraints,
  updateConstraint,
} from '../lib/api'
import type { Constraint } from '../lib/db-types'
import { isAtLeast } from '../lib/rbac'
import { Crud, ErrorBox, useAsyncError } from './Crud'

export function ConstraintsPage() {
  const { active } = useSemester()
  const { profile } = useAuth()
  const isAD = isAtLeast(profile?.role, 'academic_director')
  const { error, run } = useAsyncError()
  const [rows, setRows] = useState<Constraint[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPenalty, setEditPenalty] = useState(0)

  async function load() {
    if (!active) return
    const list = (await fetchConstraints(active.id)) ?? []
    if (list.length === 0) {
      // Seed the fixed soft-constraint types once per semester (AD-only write).
      for (const d of CONSTRAINT_DEFAULTS) {
        const ok = await run(() => addConstraint({
          semesterId: active.id, name: d.name, type: d.type, penalty: d.penalty, params: d.params,
        }))
        if (ok === undefined) break
      }
      setRows((await fetchConstraints(active.id)) ?? [])
    } else {
      setRows(list)
    }
    setLoaded(true)
  }
  useEffect(() => { void load() }, [active?.id])

  function startEdit(c: Constraint) {
    setEditId(c.id)
    setEditName(c.name)
    setEditPenalty(c.penalty)
  }

  async function onSaveEdit(id: string) {
    const ok = await run(() => updateConstraint(id, { name: editName.trim(), penalty: editPenalty }))
    if (ok === undefined) return
    setEditId(null)
    await load()
  }

  return (
    <Crud
      title="Constraints"
      note={`${rows.length} soft constraints with integer penalties (higher = relaxed/violated later).${isAD ? '' : ' Only an Academic Director / Lead Admin can edit these.'}`}
    >
      <ErrorBox error={error} />
      <table className="table">
        <thead><tr><th>Constraint</th><th>Penalty</th>{isAD && <th></th>}</tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                {editId === c.id
                  ? <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  : c.name}
              </td>
              <td>
                {editId === c.id
                  ? <input type="number" min={0} value={editPenalty} onChange={(e) => setEditPenalty(Number(e.target.value))} style={{ width: 70 }} />
                  : `${c.penalty}${c.params.min ? ` (min ${c.params.min})` : ''}`}
              </td>
              {isAD && (
                <td>
                  {editId === c.id ? (
                    <>
                      <button onClick={() => void onSaveEdit(c.id)}>Save</button>
                      <button className="secondary" onClick={() => setEditId(null)}>Cancel</button>
                    </>
                  ) : (
                    <button className="secondary" onClick={() => startEdit(c)}>Edit</button>
                  )}
                  <button className="danger" onClick={() => void run(async () => { await deleteConstraint(c.id); await load() })}>Remove</button>
                </td>
              )}
            </tr>
          ))}
          {loaded && rows.length === 0 && <tr><td colSpan={3} className="muted">No constraints yet.</td></tr>}
        </tbody>
      </table>
    </Crud>
  )
}