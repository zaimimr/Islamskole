import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const ADMIN_AREA_ROLES = ["admin", "sfo"];

export async function activeRolesForEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return [];
  const { data, error } = await createAdminClient()
    .from("guardians")
    .select("person_roles(role_key, suspended_at)")
    .ilike("email", normalized.replace(/[\\%_]/g, "\\$&"));
  if (error) throw error;
  return [
    ...new Set(
      (data ?? []).flatMap((guardian) =>
        guardian.person_roles
          .filter((role) => !role.suspended_at)
          .map((role) => role.role_key),
      ),
    ),
  ];
}
