import { placeholder } from './placeholder'

export const RosterPage = placeholder('Roster',
  'Persons, role, free-text label (advisor / dept head / affiliate), and course load.')
export const CoursesPage = placeholder('Courses',
  'Course list for the semester: code, title, number of sections, expected enrollment.')
export const QualificationsPage = placeholder('Qualifications',
  'Letter of X: person × course × level (can_teach / has_taught / can_direct).')
export const PreferencesPage = placeholder('Preferences',
  'Faculty preferences on what course to teach and during which period.')
export const LocksPage = placeholder('Locks',
  'Academic Director hard locks: course directors and forced course→period→instructor.')
export const ConstraintsPage = placeholder('Constraints',
  'Soft constraints with integer penalties (spread sections, morning/afternoon mins, M/T balance, ...).')
export const SchedulePage = placeholder('Schedule',
  'Run the deterministic solver and view/persist the resulting schedule.')