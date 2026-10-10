import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { resolveSession } from "@/lib/impersonation/session";

export const getSessionContext = cache(async () => {
  const cookieStore = await cookies();
  return resolveSession({
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      } catch {
        void 0;
      }
    },
  });
});

export async function createClient() {
  return (await getSessionContext()).client;
}
