import { describe, it, expect } from 'vitest'
import { PERIODS, areConsecutivePeriods } from '../periods'

describe('period adjacency (lunch break rule)', () => {
  it('M1 and M2 are consecutive', () => {
    expect(areConsecutivePeriods(PERIODS, 'M1', 'M2')).toBe(true)
  })
  it('M1 and M3 are NOT consecutive (M2 gap)', () => {
    expect(areConsecutivePeriods(PERIODS, 'M1', 'M3')).toBe(false)
  })
  it('M3 and M4 are consecutive (morning run)', () => {
    expect(areConsecutivePeriods(PERIODS, 'M3', 'M4')).toBe(true)
  })
  it('M4 and M5 are NOT consecutive (lunch break)', () => {
    expect(areConsecutivePeriods(PERIODS, 'M4', 'M5')).toBe(false)
  })
  it('M5 and M6 are consecutive', () => {
    expect(areConsecutivePeriods(PERIODS, 'M5', 'M6')).toBe(true)
  })
  it('M only and T are never consecutive', () => {
    expect(areConsecutivePeriods(PERIODS, 'M5', 'T5')).toBe(false)
  })
  it('validates the double-period block pairs (1,2) (3,4) (5,6)', () => {
    expect(areConsecutivePeriods(PERIODS, 'M1', 'M2')).toBe(true)
    expect(areConsecutivePeriods(PERIODS, 'M3', 'M4')).toBe(true)
    expect(areConsecutivePeriods(PERIODS, 'M5', 'M6')).toBe(true)
    // non-pairs / cross-lunch-gaps
    expect(areConsecutivePeriods(PERIODS, 'M2', 'M3')).toBe(true) // is consecutive though not a valid block START
    expect(areConsecutivePeriods(PERIODS, 'M4', 'M5')).toBe(false)
    expect(areConsecutivePeriods(PERIODS, 'T1', 'T2')).toBe(true)
    expect(areConsecutivePeriods(PERIODS, 'T4', 'T5')).toBe(false)
  })
})