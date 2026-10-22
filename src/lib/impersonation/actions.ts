"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { createClient as createSupabaseClient, type Session, type User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_AREA_ROLES, activeRolesForEmail } from "@/lib/roles";
import { getSessionContext } from "@/lib/supabase/server";
import { createCookieClient, developerIdentity } from "./session";
import { IMPERSONATION_AUTH_COOKIE, IMPERSONATION_COOKIE, IMPERSONATION_MARKER_MAX_AGE } from "./constants";

type Result = { ok: true; href: string } | { ok: false; error: string };

async function issueTargetSession(targetId: string) {
  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin.auth.admin.getUserById(targetId);
  if (targetError || !target.user?.email || !target.user.email_confirmed_at ||
    (target.user.banned_until && new Date(target.user.banned_until).getTime() > Date.now())) {
    return { ok: false, error: "Denne brukeren kan ikke logge inn." };
  }
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: target.user.email });
  if (linkError) return { ok: false, error: "Kunne ikke bytte bruker. Prøv igjen." };
  const targetClient = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verified, error: verifyError } = await targetClient.auth.verifyOtp({
    type: "magiclink", token_hash: link.properties.hashed_token,
  });
  const { data: targetClaims } = await targetClient.auth.getClaims();
  const targetSession = targetClaims?.claims.session_id;
  if (verifyError || !verified.session || verified.user?.id !== targetId || typeof targetSession !== "string") {
    if (verified.session) await targetClient.auth.signOut({ scope: "local" });
    return { ok: false, error: "Kunne ikke bytte bruker. Prøv igjen." };
  }
  return { ok: true, client: targetClient, session: verified.session, user: target.user, sessionId: targetSession };
}

async function recordImpersonation(owner: User, ownerSession: string, target: User, targetSession: string) {
  const admin = createAdminClient();
  const targetId = target.id;
  const { data: impersonation, error } = await admin.from("developer_impersonations").insert({
    developer_id: owner.id, developer_email: owner.email!, developer_session_id: ownerSession,
    target_id: targetId, target_email: target.email!, target_session_id: targetSession,
  }).select("id, expires_at").single();
  if (error) return null;
  const { error: auditError } = await admin.from("audit_log").insert({
    actor_id: owner.id, actor_email: owner.email, action: "user.impersonation_started", entity_type: "users", entity_id: targetId,
    metadata: { impersonation_id: impersonation.id, impersonated_user_id: targetId, impersonated_email: target.email },
  });
  if (auditError) {
    await admin.from("developer_impersonations").update({ ended_at: new Date().toISOString() }).eq("id", impersonation.id);
    return null;
  }
  return impersonation;
}

async function installImpersonation(session: Session, id: string) {
  const store = await cookies();
  const scoped = createCookieClient({
    getAll: () => store.getAll(),
    setAll: (entries) => entries.forEach(({ name, value, options }) => store.set(name, value, options)),
  }, true);
  const { error: sessionError } = await scoped.auth.setSession(session);
  if (sessionError) {
    return false;
  }
  store.set(IMPERSONATION_COOKIE, id, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: IMPERSONATION_MARKER_MAX_AGE,
  });
  return true;
}

export async function startImpersonation(targetId: string): Promise<Result> {
  const context = await getSessionContext();
  const owner = await developerIdentity(context.ownerClient);
  if (!owner || context.requested) return { ok: false, error: "Bare utvikleren kan bytte bruker." };
  if (!z.string().uuid().safeParse(targetId).success || targetId === owner.id) {
    return { ok: false, error: "Velg en annen bruker." };
  }
  const { data: ownerClaims } = await context.ownerClient.auth.getClaims();
  const ownerSession = ownerClaims?.claims.session_id;
  if (typeof ownerSession !== "string") return { ok: false, error: "Logg inn på nytt." };
  const issued = await issueTargetSession(targetId);
  if (!issued.ok || !issued.user || !issued.session || !issued.client || !issued.sessionId) {
    return { ok: false, error: issued.error ?? "Kunne ikke bytte bruker. Prøv igjen." };
  }
  const impersonation = await recordImpersonation(owner, ownerSession, issued.user, issued.sessionId);
  if (!impersonation || !(await installImpersonation(issued.session, impersonation.id))) {
    if (impersonation) await createAdminClient().from("developer_impersonations")
      .update({ ended_at: new Date().toISOString() }).eq("id", impersonation.id);
    await issued.client.auth.signOut({ scope: "local" });
    return { ok: false, error: "Kunne ikke registrere brukerbyttet. Prøv igjen." };
  }
  const roles = await activeRolesForEmail(issued.user.email).catch(() => []);
  return { ok: true, href: roles.some((role) => ADMIN_AREA_ROLES.includes(role)) ? "/admin" : "/min-side" };
}

export async function stopImpersonation(): Promise<Result> {
  const context = await getSessionContext();
  const impersonation = context.impersonation;
  if (impersonation && !impersonation.ended_at) {
    const admin = createAdminClient();
    const { error } = await admin.from("developer_impersonations")
      .update({ ended_at: new Date().toISOString() }).eq("id", impersonation.id).is("ended_at", null);
    if (error) return { ok: false, error: "Kunne ikke avslutte brukerbyttet. Prøv igjen." };
    const store = await cookies();
    const targetClient = createCookieClient({
      getAll: () => store.getAll(),
      setAll: (entries) => entries.forEach(({ name, value, options }) => store.set(name, value, options)),
    }, true);
    const { data } = await targetClient.auth.getClaims();
    if (data?.claims.session_id === impersonation.target_session_id) await targetClient.auth.signOut({ scope: "local" });
    const { error: auditError } = await admin.from("audit_log").insert({
      actor_id: impersonation.developer_id, actor_email: impersonation.developer_email,
      action: "user.impersonation_ended", entity_type: "users", entity_id: impersonation.target_id,
      metadata: { impersonation_id: impersonation.id, impersonated_user_id: impersonation.target_id, impersonated_email: impersonation.target_email },
    });
    if (auditError) console.error("impersonation end audit failed", auditError.code);
  }
  const store = await cookies();
  for (const { name } of store.getAll()) {
    if (name === IMPERSONATION_COOKIE || name === IMPERSONATION_AUTH_COOKIE || name.startsWith(`${IMPERSONATION_AUTH_COOKIE}.`)) store.delete(name);
  }
  const owner = await developerIdentity(context.ownerClient);
  return { ok: true, href: owner ? "/admin/brukere" : "/min-side/logg-inn" };
}
