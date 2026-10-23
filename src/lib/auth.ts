import "server-only";
import { cache } from "react";
import { createClient, getSessionContext } from "@/lib/supabase/server";
import { developerIdentity } from "@/lib/impersonation/session";

export type SessionUser = { id: string; email: string | undefined };

export const getUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: claims.email };
});

export type Permission =
  | "activities.sfo.manage"
  | "activities.sfo.roster"
  | "activities.sfo.payments"
  | "activities.class.read"
  | "students.allergies.read";

export type Access = {
  admin: boolean;
  roles: string[];
  permissions: Set<Permission>;
};

const noAccess: Access = { admin: false, roles: [], permissions: new Set() };

export const getAccess = cache(async (): Promise<Access> => {
  const user = await getUser();
  if (!user) return noAccess;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_access");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return noAccess;
  const value = data as { admin?: unknown; roles?: unknown; permissions?: unknown };
  return {
    admin: value.admin === true,
    roles: Array.isArray(value.roles) ? value.roles.map(String) : [],
    permissions: new Set(
      Array.isArray(value.permissions) ? (value.permissions.map(String) as Permission[]) : [],
    ),
  };
});

export const getIsAdmin = cache(async () => (await getAccess()).admin);

export async function hasPermission(permission: Permission) {
  return (await getAccess()).permissions.has(permission);
}

export async function requirePermission(permission: Permission) {
  if (await hasPermission(permission)) return null;
  const user = await getUser();
  return {
    ok: false as const,
    error: user
      ? "Kontoen din har ikke tilgang til å gjøre dette."
      : "Du er logget ut. Logg inn på nytt og prøv igjen.",
  };
}

export const getIsDeveloper = cache(async () => {
  const context = await getSessionContext();
  return !context.requested && Boolean(await developerIdentity(context.ownerClient));
});
