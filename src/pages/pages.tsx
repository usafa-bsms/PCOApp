import { placeholder } from './placeholder'

export const PreferencesPage = placeholder('Preferences',
  'Faculty preferences on what course to teach and during which period.')
export const LocksPage = placeholder('Locks',
  'Academic Director hard locks: course directors and forced course→period→instructor.')
export const ConstraintsPage = placeholder('Constraints',
  'Soft constraints with integer penalties (spread sections, morning/afternoon mins, M/T balance, ...).')
export const SchedulePage = placeholder('Schedule',
  'Run the deterministic solver and view/persist the resulting schedule.')