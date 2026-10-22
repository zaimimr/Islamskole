import { NextResponse, type NextRequest } from "next/server";
import { localePrefix } from "@/components/admin/paths";
import { resolvePostLoginPath } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES = new Set(["magiclink", "email"]);

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/[locale]/min-side/auth/bekreft">,
) {
  const { locale } = await ctx.params;
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") ?? "";

  if (tokenHash && OTP_TYPES.has(type)) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "magiclink" | "email",
    });
    if (!error && data.user) {
      const { data: access } = await supabase.rpc("my_access");
      const result = access as { admin?: boolean; permissions?: string[] } | null;
      const target = resolvePostLoginPath({
        next: request.nextUrl.searchParams.get("next"),
        isAdmin: Boolean(result?.admin || result?.permissions?.length),
        locale,
      });
      return NextResponse.redirect(new URL(target, request.nextUrl.origin));
    }
  }

  return NextResponse.redirect(
    new URL(`${localePrefix(locale)}/min-side/logg-inn?lenke=ugyldig`, request.nextUrl.origin),
  );
}
