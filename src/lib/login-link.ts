import "server-only";
import { localePrefix } from "@/components/admin/paths";
import { hasAdminRole } from "@/lib/impersonation/constants";
import { safeNextPath } from "@/lib/auth-redirect";
import { sendLoginLinkEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

export async function findAuthUserId(email: string) {
  const { data, error } = await createAdminClient().rpc("auth_user_id_by_email", {
    p_email: email.trim(),
  });
  if (error) throw error;
  return data ?? null;
}

export async function createLoginTokenHash(rawEmail: string): Promise<string | null> {
  const email = rawEmail.trim().toLowerCase();
  const admin = createAdminClient();
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { role: "member" },
  });
  if (createError && createError.code !== "email_exists") {
    console.error("login createUser failed", createError);
    return null;
  }
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    console.error("login generateLink failed", error);
    return null;
  }
  return tokenHash;
}

export async function sendLoginLink(input: {
  email: string;
  locale: "no" | "en";
  next?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  if (!site) return { ok: false, error: "NEXT_PUBLIC_SITE_URL mangler" };

  const tokenHash = await createLoginTokenHash(email);
  if (!tokenHash) return { ok: false, error: "Kunne ikke lage innloggingslenken. Prøv igjen." };

  const url = new URL(`${site}${localePrefix(input.locale)}/min-side/auth/bekreft`);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", "magiclink");
  const next = safeNextPath(input.next);
  if (next) url.searchParams.set("next", next);

  const sent = await sendLoginLinkEmail({ to: email, url: url.toString(), lang: input.locale });
  if (!sent) {
    console.error("login link email failed");
    return { ok: false, error: "Kunne ikke sende e-posten. Prøv igjen." };
  }
  return { ok: true };
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function isKnownEmail(email: string) {
  const admin = createAdminClient();
  const pattern = escapeLike(email);
  const [guardians, students] = await Promise.all([
    admin.from("guardians").select("id").ilike("email", pattern).limit(1),
    admin.from("students").select("id").ilike("child_email", pattern).limit(1),
  ]);
  if (guardians.error || students.error) {
    console.error("portal login lookup failed", guardians.error ?? students.error);
    return false;
  }
  if (guardians.data?.length || students.data?.length) return true;
  const userId = await findAuthUserId(email);
  if (!userId) return false;
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return hasAdminRole(profile?.role);
}
