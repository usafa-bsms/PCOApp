export type Day = 'M' | 'T'
export type PartOfDay = 'morning' | 'afternoon'

export interface Period {
  /** Canonical code, e.g. "M1".."M6", "T1".."T6". */
  code: string
  day: Day
  slot: number
  partOfDay: PartOfDay
}

/** Canonical list of the 12 periods, sorted by (day, slot). */
export const PERIODS: readonly Period[] = (['M', 'T'] as const).flatMap((day) =>
  [1, 2, 3, 4, 5, 6].map((slot) => ({
    code: `${day}${slot}`,
    day,
    slot,
    partOfDay: slot <= 3 ? 'morning' : 'afternoon',
  }))
)

export const PERIOD_CODES: readonly string[] = PERIODS.map((p) => p.code)

export function periodByCode(code: string): Period | undefined {
  return PERIODS.find((p) => p.code === code)
}

export function isMorning(_day: Day, slot: number): boolean {
  return slot <= 3
}

/**
 * Consecutive-class graph. Two slots are "consecutive" only if they have no
 * forced gap between them. Note the LUNCH BREAK between M4 and M5 (also T4/T5):
 * M4→M5 is NOT consecutive, so a teacher on M4,M5 has a break (not a double).
 */
const NEXT_ADJACENT: Record<number, number | undefined> = {
  1: 2, 2: 3, 3: undefined, // lunch between 3 and 4
  4: 5, 5: 6, 6: undefined,
}

/**
 * True if the two codes are on the same day and their slot gap is a single
 * no-break step (e.g. M1->M2, M3 is NOT adjacent to M4).
 */
export function areConsecutivePeriods(periods: readonly Period[], a: string, b: string): boolean {
  const pa = periods.find((p) => p.code === a)
  const pb = periods.find((p) => p.code === b)
  if (!pa || !pb || pa.day !== pb.day) return false
  const lo = Math.min(pa.slot, pb.slot)
  const hi = Math.max(pa.slot, pb.slot)
  return hi - lo === 1 && NEXT_ADJACENT[lo] === hi
}