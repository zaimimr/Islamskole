import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import {
  DEVELOPER_EMAIL,
  IMPERSONATION_AUTH_COOKIE,
  IMPERSONATION_COOKIE,
} from "./constants";

export type CookieAdapter = {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => void;
};

export function createCookieClient(adapter: CookieAdapter, impersonating = false) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: adapter,
      ...(impersonating ? {
        cookieOptions: {
          name: IMPERSONATION_AUTH_COOKIE,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax" as const,
          path: "/",
        },
      } : {}),
    },
  );
}

export async function developerIdentity(client: ReturnType<typeof createCookieClient>) {
  const { data, error } = await client.auth.getUser();
  const user = data.user;
  if (error || !user?.email_confirmed_at || user.email?.toLowerCase() !== DEVELOPER_EMAIL) return null;
  const { data: allowed, error: permissionError } = await client.rpc("developer_can_impersonate");
  return !permissionError && allowed === true ? user : null;
}

export async function resolveSession(adapter: CookieAdapter) {
  const ownerClient = createCookieClient(adapter);
  const marker = adapter.getAll().find(({ name }) => name === IMPERSONATION_COOKIE)?.value;
  if (!marker) return { client: ownerClient, ownerClient, requested: false, active: false, impersonation: null };

  const anonymous = createCookieClient({ getAll: () => [], setAll: () => {} });
  const denied = { client: anonymous, ownerClient, requested: true, active: false, impersonation: null };
  if (!/^[0-9a-f-]{36}$/i.test(marker)) return denied;
  const owner = await developerIdentity(ownerClient);
  if (!owner) return denied;
  const { data: ownerClaims } = await ownerClient.auth.getClaims();
  const ownerSession = ownerClaims?.claims.session_id;
  if (typeof ownerSession !== "string") return denied;

  const { data: impersonation, error } = await createAdminClient()
    .from("developer_impersonations").select("*").eq("id", marker)
    .eq("developer_id", owner.id).eq("developer_session_id", ownerSession).maybeSingle();
  if (error || !impersonation) return denied;
  const inactive = { ...denied, impersonation };
  if (impersonation.ended_at || new Date(impersonation.expires_at).getTime() <= Date.now()) return inactive;

  const client = createCookieClient(adapter, true);
  const { data } = await client.auth.getClaims();
  if (data?.claims.sub !== impersonation.target_id || data.claims.session_id !== impersonation.target_session_id) return inactive;
  return { client, ownerClient, requested: true, active: true, impersonation };
}
