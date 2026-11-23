import { NextResponse, type NextRequest } from "next/server";
import { localePrefix } from "@/components/admin/paths";
import { safeNextPath } from "@/lib/auth-redirect";
import { VIPPS_LOGIN_COOKIE, createVippsLoginState, vippsAuthorizeUrl } from "@/lib/vipps-login";

export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale") === "en" ? "en" : "no";
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const login = createVippsLoginState(locale, next);
  const target = vippsAuthorizeUrl(request.nextUrl.origin, login);
  if (!target) {
    return NextResponse.redirect(
      new URL(`${localePrefix(locale)}/min-side/logg-inn?vipps=feil`, request.nextUrl.origin),
    );
  }
  const response = NextResponse.redirect(target);
  response.cookies.set(VIPPS_LOGIN_COOKIE, JSON.stringify(login), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/auth/vipps",
    maxAge: 600,
  });
  return response;
}
