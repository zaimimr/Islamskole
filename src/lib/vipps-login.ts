import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { findAuthUserId, isKnownEmail } from "@/lib/login-link";
import { isPlaceholderEmail } from "@/lib/portal/emails";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export const VIPPS_LOGIN_COOKIE = "vipps-login";
export const VIPPS_LOGIN_SCOPES = "openid name phoneNumber email address";

export type VippsLoginState = {
  state: string;
  nonce: string;
  verifier: string;
  locale: "no" | "en";
  next: string | null;
};

export type VippsUserInfo = {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  phone_number?: string;
  email?: string;
  email_verified?: boolean;
  address?: Json;
  birthdate?: string;
};

function config(origin: string) {
  const clientId = process.env.VIPPS_CLIENT_ID;
  const clientSecret = process.env.VIPPS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const base = (process.env.VIPPS_BASE_URL ?? "https://apitest.vipps.no").replace(/\/$/, "");
  return {
    clientId,
    clientSecret,
    redirectUri: `${origin}/api/auth/vipps/callback`,
    authorizeUrl: `${base}/access-management-1.0/access/oauth2/auth`,
    tokenUrl: `${base}/access-management-1.0/access/oauth2/token`,
    userInfoUrl: `${base}/vipps-userinfo-api/userinfo`,
  };
}

function randomToken() {
  return randomBytes(32).toString("base64url");
}

export function createVippsLoginState(locale: "no" | "en", next: string | null): VippsLoginState {
  return { state: randomToken(), nonce: randomToken(), verifier: randomToken(), locale, next };
}

export function vippsAuthorizeUrl(origin: string, login: VippsLoginState): string | null {
  const cfg = config(origin);
  if (!cfg) return null;
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", VIPPS_LOGIN_SCOPES);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("state", login.state);
  url.searchParams.set("nonce", login.nonce);
  url.searchParams.set("code_challenge", createHash("sha256").update(login.verifier).digest("base64url"));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("ui_locales", login.locale === "en" ? "en" : "no");
  return url.toString();
}

function idTokenNonce(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof claims.nonce === "string" ? claims.nonce : null;
  } catch {
    return null;
  }
}

export async function fetchVippsUser(
  origin: string,
  code: string,
  login: VippsLoginState,
): Promise<VippsUserInfo | null> {
  const cfg = config(origin);
  if (!cfg) return null;
  const tokenResponse = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
      code_verifier: login.verifier,
    }),
    cache: "no-store",
  });
  if (!tokenResponse.ok) {
    console.error("vipps login token failed", tokenResponse.status, await tokenResponse.text());
    return null;
  }
  const token = await tokenResponse.json();
  if (idTokenNonce(token.id_token) !== login.nonce) {
    console.error("vipps login nonce mismatch");
    return null;
  }
  const userResponse = await fetch(cfg.userInfoUrl, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
  });
  if (!userResponse.ok) {
    console.error("vipps login userinfo failed", userResponse.status);
    return null;
  }
  const user = (await userResponse.json()) as VippsUserInfo;
  return typeof user.sub === "string" && user.sub ? user : null;
}

async function linkedEmail(sub: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("vipps_logins").select("user_id").eq("sub", sub).maybeSingle();
  if (!data) return null;
  const { data: auth } = await admin.auth.admin.getUserById(data.user_id);
  return auth.user?.email?.toLowerCase() ?? null;
}

async function phoneEmail(phone: string | undefined): Promise<string | null> {
  if (!phone) return null;
  const { data, error } = await createAdminClient().rpc("vipps_login_email_for_phone", { p_phone: phone });
  if (error) {
    console.error("vipps login phone lookup failed", error);
    return null;
  }
  return data ?? null;
}

async function verifiedEmail(user: VippsUserInfo): Promise<string | null> {
  const email = user.email?.trim().toLowerCase();
  if (!email || user.email_verified !== true || isPlaceholderEmail(email)) return null;
  return (await isKnownEmail(email)) ? email : null;
}

export async function matchVippsUser(user: VippsUserInfo): Promise<string | null> {
  return (await linkedEmail(user.sub)) ?? (await phoneEmail(user.phone_number)) ?? (await verifiedEmail(user));
}

function splitName(user: VippsUserInfo) {
  return {
    first: user.given_name?.trim() || null,
    last: user.family_name?.trim() || null,
  };
}

export async function saveVippsUser(email: string, user: VippsUserInfo) {
  const admin = createAdminClient();
  const userId = await findAuthUserId(email);
  if (!userId) return;
  const birthdate = user.birthdate && /^\d{4}-\d{2}-\d{2}$/.test(user.birthdate) ? user.birthdate : null;
  const { error } = await admin.from("vipps_logins").upsert(
    {
      user_id: userId,
      sub: user.sub,
      name: user.name ?? null,
      given_name: user.given_name ?? null,
      family_name: user.family_name ?? null,
      phone: user.phone_number ?? null,
      email: user.email?.toLowerCase() ?? null,
      email_verified: user.email_verified === true,
      address: user.address ?? null,
      birthdate,
      last_login_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) console.error("vipps login save failed", error);

  const { first, last } = splitName(user);
  const phone = user.phone_number ? `+${user.phone_number.replace(/\D/g, "")}` : null;
  const { data: rows } = await admin
    .from("guardians")
    .select("id, first_name, last_name, phone")
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"));
  for (const row of rows ?? []) {
    const patch: { first_name?: string; last_name?: string; phone?: string } = {};
    if (!row.first_name && first) patch.first_name = first;
    if (!row.last_name && last) patch.last_name = last;
    if (!row.phone && phone) patch.phone = phone;
    if (Object.keys(patch).length) await admin.from("guardians").update(patch).eq("id", row.id);
  }
}
