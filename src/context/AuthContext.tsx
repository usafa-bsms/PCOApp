import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '../utils/supabase'
import type { Role } from '../lib/rbac'

interface AuthProfile {
  name: string
  role: Role
  label?: string | null
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: AuthProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<AuthProfile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    // A person is now a per-semester persona linked to the auth account via
    // auth_user_id; pick the persona from the active semester.
    const { data, error } = await supabase
      .from('persons')
      .select('name, role, label, semester:semesters!inner(is_active)')
      .eq('auth_user_id', userId)
    if (error || !data || data.length === 0) {
      setProfile(null)
      return
    }
    const active = (data as unknown as Array<{ name: string; role: Role; label: string | null; semester: { is_active: boolean } }>).find(
      (p) => p.semester.is_active,
    ) ?? data[0] as unknown as { name: string; role: Role; label: string | null }
    setProfile({ name: active.name, role: active.role, label: active.label })
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user) void loadProfile(data.session.user.id)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s?.user) void loadProfile(s.user.id)
      else setProfile(null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error?.message }
    },
    async signOut() {
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}