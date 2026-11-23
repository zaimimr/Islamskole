import { NextResponse, type NextRequest } from "next/server";
import { localePrefix } from "@/components/admin/paths";
import { createLoginTokenHash } from "@/lib/login-link";
import {
  VIPPS_LOGIN_COOKIE,
  fetchVippsUser,
  matchVippsUser,
  saveVippsUser,
  type VippsLoginState,
} from "@/lib/vipps-login";

function readState(raw: string | undefined): VippsLoginState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as VippsLoginState;
    return value.state && value.nonce && value.verifier ? value : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const login = readState(request.cookies.get(VIPPS_LOGIN_COOKIE)?.value);
  const locale = login?.locale ?? "no";
  const origin = request.nextUrl.origin;
  const finish = (url: URL) => {
    const response = NextResponse.redirect(url);
    response.cookies.delete({ name: VIPPS_LOGIN_COOKIE, path: "/api/auth/vipps" });
    return response;
  };
  const fail = (reason: "feil" | "ingen-konto" | "avbrutt") =>
    finish(new URL(`${localePrefix(locale)}/min-side/logg-inn?vipps=${reason}`, origin));

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return fail("avbrutt");
  const code = params.get("code");
  if (!login || !code || params.get("state") !== login.state) return fail("feil");

  const user = await fetchVippsUser(origin, code, login);
  if (!user) return fail("feil");

  const email = await matchVippsUser(user);
  if (!email) return fail("ingen-konto");

  const tokenHash = await createLoginTokenHash(email);
  if (!tokenHash) return fail("feil");
  await saveVippsUser(email, user);

  const url = new URL(`${localePrefix(locale)}/min-side/auth/bekreft`, origin);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", "magiclink");
  if (login.next) url.searchParams.set("next", login.next);
  return finish(url);
}
