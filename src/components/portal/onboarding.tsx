import { createClient } from "@/lib/supabase/server";
import type { PortalContext } from "@/lib/portal/types";
import { PortalOnboardingGuide } from "./onboarding-guide";

export async function PortalOnboarding({ locale, context }: { locale: string; context: PortalContext }) {
  if (!context.user || (!context.isGuardian && !context.isStudent)) return null;
  const client = await createClient();
  const { data, error } = await client.from("portal_onboarding").select("role").eq("user_id", context.user.id);
  if (error) {
    console.error("Could not load portal onboarding", error);
    return null;
  }
  const completed = new Set(data.map((row) => row.role));
  return (
    <>
      {context.isGuardian && !completed.has("parent") ? <PortalOnboardingGuide locale={locale} role="parent" /> : null}
      {context.isStudent && !completed.has("student") ? <PortalOnboardingGuide locale={locale} role="student" /> : null}
    </>
  );
}
