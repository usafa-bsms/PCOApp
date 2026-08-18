export type Role = 'faculty' | 'academic_director' | 'lead_admin'

export const ROLE_RANK: Record<Role, number> = {
  faculty: 0,
  academic_director: 1,
  lead_admin: 2,
}

export function hasRole(userRole: Role | null | undefined, required: Role): boolean {
  if (!userRole) return false
  return ROLE_RANK[userRole] >= ROLE_RANK[required]
}

export function isAtLeast(userRole: Role | null | undefined, required: Role): boolean {
  return hasRole(userRole, required)
}

/**
 * A person's `label` is a free-text tag (advisor, dept head, affiliate faculty, ...)
 * used for context only — it does NOT grant any authorization. Role is the only
 * authorization signal.
 */
export function describePerson(label?: string | null): string | null {
  return label && label.trim().length > 0 ? label : null
}