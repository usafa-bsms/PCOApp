import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/semesters', label: 'Semesters' },
  { to: '/roster', label: 'Roster' },
  { to: '/courses', label: 'Courses' },
  { to: '/qualifications', label: 'Qualifications' },
  { to: '/preferences', label: 'Preferences' },
  { to: '/locks', label: 'Locks' },
  { to: '/constraints', label: 'Constraints' },
  { to: '/rooms', label: 'Rooms' },
  { to: '/schedule', label: 'Schedule' },
]

export function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  return (
    <div className="layout">
      <header className="topbar">
        <strong>{profile?.name ?? 'PCOApp'}</strong>
        <span className="role">{profile?.role}</span>
        {profile?.label && <span className="label">{profile.label}</span>}
        <button onClick={() => void signOut()}>Sign out</button>
      </header>
      <nav className="nav">
        {NAV.map((n) => (
          <a key={n.to} href={`#${n.to}`}>
            {n.label}
          </a>
        ))}
      </nav>
      <main>{children}</main>
    </div>
  )
}