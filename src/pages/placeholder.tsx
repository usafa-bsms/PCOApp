import type { ReactNode } from 'react'

export function placeholder(title: string, note: string): () => ReactNode {
  return function PlaceholderPage() {
    return (
      <section>
        <h2>{title}</h2>
        <p>{note}</p>
        <p className="muted">Input CRUD wiring lands in a follow-up step.</p>
      </section>
    )
  }
}