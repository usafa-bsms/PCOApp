import { useState, type ReactNode } from 'react'

export function Crud({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {note && <p className="muted">{note}</p>}
      {children}
    </section>
  )
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null
  return <p className="error">{error}</p>
}

export function useAsyncError() {
  const [error, setError] = useState<string | null>(null)
  return {
    error,
    setError,
    clear() {
      setError(null)
    },
    run<T>(fn: () => Promise<T>): Promise<T | undefined> {
      setError(null)
      return fn().catch((e) => {
        setError(e?.message ?? String(e))
        return undefined
      })
    },
  }
}