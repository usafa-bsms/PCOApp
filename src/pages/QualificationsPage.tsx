import { useEffect, useState } from 'react'
import { useSemester } from '../context/SemesterContext'
import { fetchCourses, fetchPersons, fetchQualifications, setQualification } from '../lib/api'
import type { Course, Person, QualLevel } from '../lib/db-types'
import { Crud, ErrorBox, useAsyncError } from './Crud'

const LEVELS: QualLevel[] = ['can_teach', 'has_taught', 'can_direct']

export function QualificationsPage() {
  const { active } = useSemester()
  const { error, run } = useAsyncError()
  const [people, setPeople] = useState<Person[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [quals, setQuals] = useState<Set<string>>(new Set())

  async function load() {
    if (!active) return
    const [p, c, q] = await Promise.all([
      fetchPersons(active.id), fetchCourses(active.id), fetchQualifications(active.id),
    ])
    setPeople(p ?? [])
    setCourses(c ?? [])
    setQuals(new Set((q ?? []).map((x) => `${x.person_id}|${x.course_id}|${x.level}`)))
  }
  useEffect(() => { void load() }, [active?.id])

  function toggle(p: Person, c: Course, level: QualLevel) {
    const key = `${p.id}|${c.id}|${level}`
    const enabled = !quals.has(key)
    setQuals((prev) => {
      const next = new Set(prev)
      if (enabled) next.add(key); else next.delete(key)
      return next
    })
    void run(() => setQualification(p.id, c.id, level, enabled))
  }

  if (!people.length && !courses.length) {
    return <Crud title="Qualifications"><p className="muted">Add instructors and courses first.</p></Crud>
  }

  return (
    <Crud title="Qualifications" note="Mark who can teach / has taught / can direct each course. Changes are saved immediately.">
      <ErrorBox error={error} />
      <div className="scroll">
        <table className="table qual">
          <thead>
            <tr>
              <th>Instructor</th>
              {courses.map((c) => (
                <th key={c.id} title={c.title ?? ''}>{c.code}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                {courses.map((c) => (
                  <td key={c.id} className="qualcells">
                    {LEVELS.map((lv) => (
                      <input
                        key={lv}
                        type="checkbox"
                        title={`${p.name} — ${c.code} — ${lv}`}
                        checked={quals.has(`${p.id}|${c.id}|${lv}`)}
                        onChange={() => toggle(p, c, lv)}
                      />
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Columns per course: can_teach · has_taught · can_direct.</p>
    </Crud>
  )
}