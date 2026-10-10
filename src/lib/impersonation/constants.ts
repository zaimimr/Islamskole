export const DEVELOPER_EMAIL = "zaim.imran@gmail.com";
export const IMPERSONATION_COOKIE = "islamskole-impersonation";
export const IMPERSONATION_AUTH_COOKIE = "islamskole-impersonation-auth";
export const IMPERSONATION_MARKER_MAX_AGE = 400 * 24 * 60 * 60;

export function hasAdminRole(role: string | null | undefined) {
  return role === "admin" || role === "developer";
}
