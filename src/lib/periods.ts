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