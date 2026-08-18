import { useEffect, useState } from 'react'
import { useSemester } from '../context/SemesterContext'
import { addCourse, deleteCourse, fetchCourses } from '../lib/api'
import type { Course } from '../lib/db-types'
import { Crud, ErrorBox, useAsyncError } from './Crud'

export function CoursesPage() {
  const { active } = useSemester()
  const { error, run } = useAsyncError()
  const [courses, setCourses] = useState<Course[]>([])
  const [code, setCode] = useState('')
  const [title, setTitle] = useState('')
  const [sections, setSections] = useState(1)
  const [enroll, setEnroll] = useState(0)
  const [double, setDouble] = useState(false)

  async function load() {
    if (!active) return
    setCourses(await fetchCourses(active.id) ?? [])
  }
  useEffect(() => { void load() }, [active?.id])

  async function onAdd() {
    if (!active || !code.trim()) return
    const ok = await run(() => addCourse({
      semesterId: active.id, code: code.trim(), title: title.trim(),
      sections, expectedEnrollment: enroll, isDoublePeriod: double,
    }))
    if (ok === undefined) return
    setCode(''); setTitle(''); setSections(1); setEnroll(0); setDouble(false)
    await load()
  }

  return (
    <Crud title="Courses" note={`${courses.length} courses in ${active?.name ?? 'the active semester'}.`}>
      <ErrorBox error={error} />
      <table className="table">
        <thead><tr><th>Code</th><th>Title</th><th>Sections</th><th>Enrollment</th><th>Double</th><th></th></tr></thead>
        <tbody>
          {courses.map((c) => (
            <tr key={c.id}>
              <td>{c.code}</td>
              <td>{c.title ?? ''}</td>
              <td>{c.sections}</td>
              <td>{c.expected_enrollment}</td>
              <td>{c.is_double_period ? 'yes' : ''}</td>
              <td><button className="danger" onClick={() => void run(async () => { await deleteCourse(c.id); await load() })}>Remove</button></td>
            </tr>
          ))}
          {courses.length === 0 && <tr><td colSpan={6} className="muted">No courses yet.</td></tr>}
        </tbody>
      </table>

      <h3>Add course</h3>
      <div className="grid">
        <input placeholder="Code (e.g. MATH 411)" value={code} onChange={(e) => setCode(e.target.value)} />
        <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="number" min={1} value={sections} onChange={(e) => setSections(Number(e.target.value))} title="Sections" />
        <input type="number" min={0} value={enroll} onChange={(e) => setEnroll(Number(e.target.value))} title="Expected enrollment" />
        <label className="check"><input type="checkbox" checked={double} onChange={(e) => setDouble(e.target.checked)} /> Double period</label>
        <button onClick={() => void onAdd()}>Add</button>
      </div>
    </Crud>
  )
}