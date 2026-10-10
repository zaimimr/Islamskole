import { resolveSession } from "@/lib/impersonation/session";
import type { NextRequest, NextResponse } from "next/server";

export async function updateSession(
  request: NextRequest,
  response: NextResponse,
) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return { response, user: null };
  }

  const session = await resolveSession({
    getAll() {
      return request.cookies.getAll();
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value, options }) => {
        request.cookies.set(name, value);
        response.cookies.set(name, value, options);
      });
    },
  });

  const { data } = await session.client.auth.getClaims();

  return { response, user: data?.claims?.sub ? data.claims : null };
}
