import type { Assignment } from './types'
import { PERIODS } from '../lib/periods'

/**
 * Deferred room-filling pass. Rooms are NOT a binding constraint in the core
 * search (per the domain practice); this pass assigns a room to every teaching
 * section afterward.
 *
 * Heuristic (mirrors manual practice):
 *  - Keep an instructor in their same room across ALL their sections when
 *    possible (rooms don't conflict across different periods, so an instructor
 *    keeps one room for the whole week).
 *  - Switch away from the preferred room only when it is already occupied in
 *    that period by another section, or when the instructor has a schedule
 *    break (lunch / non-consecutive gap) and the preferred room is taken.
 *  - Otherwise fall back to the first free, sorted room.
 *  - A **double-period** section (doubleBlockStart) holds ONE room across BOTH
 *    periods of its block (the room is occupied in both and must be free in
 *    both before being picked).
 *
 * Deterministic: sections iterate by (comparable period, person), rooms in
 * sorted order; all ties canonical.
 */
export function assignRooms(assignments: Assignment[], rooms: string[]): Assignment[] {
  const out = assignments.map((a) => ({ ...a }))
  if (rooms.length === 0) return out

  const sortedRooms = [...rooms].sort()
  const roomPeriod = new Map<string, Set<string>>() // room -> periods occupied
  const lastRoomByPerson = new Map<string, string>()

  const teachers = out
    .map((a, idx) => ({ a, idx }))
    .filter(({ a }) => a.role !== 'director' && a.period !== '')
    .sort((x, y) => {
      const pi = comparablePeriod(x.a.period) - comparablePeriod(y.a.period)
      if (pi !== 0) return pi
      return x.a.personId < y.a.personId ? -1 : x.a.personId > y.a.personId ? 1 : 0
    })

  const occupiedPeriods = (a: Assignment): string[] => {
    if (!a.doubleBlockStart) return [a.period]
    const partner = `${a.period.charAt(0)}${Number(a.period.charAt(1)) + 1}`
    return [a.period, partner]
  }

  const usedAll = (periods: string[]): Set<string> => {
    const merged = new Set<string>()
    for (const per of periods) for (const r of roomPeriod.get(per) ?? []) merged.add(r)
    return merged
  }
  const occupy = (periods: string[], room: string): void => {
    for (const per of periods) {
      const set = roomPeriod.get(per) ?? new Set<string>()
      set.add(room)
      roomPeriod.set(per, set)
    }
  }

  for (const { a, idx } of teachers) {
    const periods = occupiedPeriods(a)
    const freeNow = usedAll(periods)

    const preferred = lastRoomByPerson.get(a.personId)
    const pick =
      preferred && !freeNow.has(preferred)
        ? preferred
        : sortedRooms.find((r) => !freeNow.has(r))

    if (pick) {
      occupy(periods, pick)
      out[idx] = { ...a, roomId: pick }
      lastRoomByPerson.set(a.personId, pick)
    }
    // If no room free (all occupied), the section is left without a room.
  }

  return out
}

function comparablePeriod(period: string): number {
  return PERIODS.findIndex((p) => p.code === period)
}