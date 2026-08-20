import type { ConstraintType } from './db-types'

/**
 * Default soft-constraint set seeded for each new semester. Pure constants so
 * the scheduler tests can reference them without pulling in the Supabase client.
 */
export const CONSTRAINT_DEFAULTS: Array<{
  name: string
  type: ConstraintType
  penalty: number
  params: Record<string, number>
}> = [
  { name: 'Spread sections across the week', type: 'spread_sections', penalty: 25, params: {} },
  { name: 'Morning schedule minimum', type: 'morning_min', penalty: 15, params: { min: 0 } },
  { name: 'Afternoon schedule minimum', type: 'afternoon_min', penalty: 15, params: { min: 0 } },
  { name: 'M/T balance', type: 'balance_mt', penalty: 20, params: {} },
  { name: 'Consecutive periods', type: 'consecutive_periods', penalty: 10, params: {} },
  { name: 'Teach on a single day', type: 'single_day', penalty: 12, params: {} },
  { name: 'No forced breaks', type: 'no_forced_break', penalty: 10, params: {} },
  { name: 'Avoid single-offering peak slots', type: 'single_offering_peak', penalty: 30, params: {} },
  { name: 'Two sections in same block', type: 'two_section_same_block', penalty: 15, params: {} },
]