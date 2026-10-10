import "server-only";
import { cache } from "react";
import { createClient, getSessionContext } from "@/lib/supabase/server";
import { hasAdminRole } from "@/lib/impersonation/constants";
import { developerIdentity } from "@/lib/impersonation/session";

export type SessionUser = { id: string; email: string | undefined };

export const getUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: claims.email };
});

export const getIsAdmin = cache(async () => {
  const user = await getUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return hasAdminRole(data?.role);
});

export const getIsDeveloper = cache(async () => {
  const context = await getSessionContext();
  return !context.requested && Boolean(await developerIdentity(context.ownerClient));
});
