import type { SolveInput } from './types'

/**
 * Re-order every collection that feeds the solver into a canonical sequence.
 * Determinism depends on this: we must NEVER depend on input/DB insertion order.
 *
 * Tie-breaking is by stable, comparable fields (id/code), never by identity.
 */
function byCode(a: { code: string }, b: { code: string }): number {
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

export function normalizeInput(input: SolveInput): SolveInput {
  const persons = [...input.persons].sort(byName)
  const courses = [...input.courses].sort(byCode)
  const qualifications = [...input.qualifications].sort(
    (a, b) =>
      byName({ name: a.personId }, { name: b.personId }) ||
      byCode({ code: a.courseId }, { code: b.courseId })
  )
  const periods = [...input.periods].sort(
    (a, b) =>
      (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) || a.slot - b.slot
  )
  const preferences = [...input.preferences].sort(
    (a, b) =>
      byName({ name: a.personId }, { name: b.personId }) ||
      (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0)
  )
  const locks = [...input.locks].sort(
    (a, b) =>
      byCode({ code: a.courseId }, { code: b.courseId }) ||
      byName({ name: a.personId }, { name: b.personId })
  )
  const constraints = [...input.constraints].sort(
    (a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0)
  )

  return { persons, courses, qualifications, periods, preferences, locks, constraints }
}