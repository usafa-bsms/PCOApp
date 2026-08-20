import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { SemestersPage } from './pages/SemestersPage'
import { RosterPage } from './pages/RosterPage'
import { CoursesPage } from './pages/CoursesPage'
import { QualificationsPage } from './pages/QualificationsPage'
import {
  PreferencesPage,
  LocksPage,
  ConstraintsPage,
  ClassroomsPage,
  SchedulePage,
} from './pages/pages'

/** HashRouter: asset paths on GitHub Pages are opaque; hashed routes work everywhere. */
export function AppRouter() {
  const { session, loading } = useAuth()

  if (loading) return <div className="muted">Loading…</div>

  if (!session) {
    return (
      <HashRouter>
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </HashRouter>
    )
  }

  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/semesters" element={<SemestersPage />} />
          <Route path="/roster" element={<RosterPage />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/qualifications" element={<QualificationsPage />} />
          <Route path="/preferences" element={<PreferencesPage />} />
          <Route path="/locks" element={<LocksPage />} />
          <Route path="/constraints" element={<ConstraintsPage />} />
          <Route path="/rooms" element={<ClassroomsPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </HashRouter>
  )
}