import { useState } from 'react'
import { useSemester } from '../context/SemesterContext'
import { copySemester, createSemester } from '../lib/api'
import { Crud, ErrorBox, useAsyncError } from './Crud'

export function SemestersPage() {
  const { semesters, refresh, activate } = useSemester()
  const { error, run } = useAsyncError()
  const [newName, setNewName] = useState('')
  const [copyName, setCopyName] = useState('')

  return (
    <Crud title="Semesters" note="One active semester at a time. Carry a semester forward to clone its roster, course load, and courses.">
      <ErrorBox error={error} />

      <table className="table">
        <thead>
          <tr><th>Status</th><th>Name</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {semesters.map((s) => (
            <tr key={s.id}>
              <td>{s.is_active ? <strong>Active</strong> : <span className="muted">—</span>}</td>
              <td>{s.name}</td>
              <td>
                {!s.is_active && (
                  <button onClick={() => void run(async () => { await activate(s.id) })}>Activate</button>
                )}
                <button
                  className="secondary"
                  onClick={() => void run(async () => {
                    const name = copyName.trim() || `${s.name} (copy)`
                    await copySemester(s.id, name)
                    await refresh()
                    setCopyName('')
                  })}
                >
                  Carry forward…
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="row">
        <input
          placeholder="New semester name for copy"
          value={copyName}
          onChange={(e) => setCopyName(e.target.value)}
        />
      </div>

      <h3>Create empty semester</h3>
      <div className="row">
        <input
          placeholder="e.g. Spring 2027"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          onClick={() => void run(async () => {
            if (!newName.trim()) return
            await createSemester(newName.trim())
            await refresh()
            setNewName('')
          })}
        >
          Create
        </button>
      </div>
    </Crud>
  )
}