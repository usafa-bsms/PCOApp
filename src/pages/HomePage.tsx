import { useAuth } from '../context/AuthContext'
import { useSemester } from '../context/SemesterContext'

export function HomePage() {
  const { profile } = useAuth()
  const { active } = useSemester()
  return (
    <section>
      <h2>Home</h2>
      <p>Signed in as {profile?.name ?? 'unknown'} ({profile?.role}).</p>
      <p>
        Active semester: <strong>{active?.name ?? 'none'}</strong>.
        Use <a href="#/semesters">Semesters</a> to carry a semester forward,
        or manage the <a href="#/roster">Roster</a> and <a href="#/courses">Courses</a>.
      </p>
    </section>
  )
}