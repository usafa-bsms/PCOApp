import { useAuth } from '../context/AuthContext'

export function HomePage() {
  const { profile } = useAuth()
  return (
    <section>
      <h2>Home</h2>
      <p>Signed in as {profile?.name ?? 'unknown'} ({profile?.role}).</p>
      <p>
        Roster, courses, qualifications, preferences, locks, and constraints are
        seeded here. See <code>docs/ARCHITECTURE.md</code> for the plan.
      </p>
    </section>
  )
}