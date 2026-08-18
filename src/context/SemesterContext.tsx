import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { fetchSemesters, setActiveSemester } from '../lib/api'
import type { Semester } from '../lib/db-types'
import { useAuth } from './AuthContext'

interface SemesterContextValue {
  semesters: Semester[]
  active: Semester | null
  loading: boolean
  refresh: () => Promise<void>
  activate: (id: string) => Promise<void>
}

const SemesterContext = createContext<SemesterContextValue | undefined>(undefined)

export function SemesterProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [loading, setLoading] = useState(true)

  async function refresh() {
    const list = await fetchSemesters()
    setSemesters(list)
    setLoading(false)
  }

  async function activate(id: string) {
    await setActiveSemester(id)
    await refresh()
  }

  useEffect(() => {
    if (!session) {
      setSemesters([])
      setLoading(false)
      return
    }
    refresh().catch(() => setLoading(false))
  }, [session?.user.id])

  const active = semesters.find((s) => s.is_active) ?? semesters[0] ?? null

  return (
    <SemesterContext.Provider value={{ semesters, active, loading, refresh, activate }}>
      {children}
    </SemesterContext.Provider>
  )
}

export function useSemester(): SemesterContextValue {
  const ctx = useContext(SemesterContext)
  if (!ctx) throw new Error('useSemester must be used within SemesterProvider')
  return ctx
}