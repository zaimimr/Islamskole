import { getSessionContext } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { ReturnToAccount } from "./return-to-account";

export async function ImpersonationBanner() {
  const { requested, active, impersonation } = await getSessionContext();
  if (!requested) return null;
  const t = await getTranslations("impersonation");
  return (
    <aside aria-label={t("label")} className="relative z-50 border-b border-amber-800/20 bg-amber-100 px-4 py-2 text-amber-950 print:hidden">
      <div className="mx-auto flex max-w-[96rem] flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 break-all text-sm font-bold">
          {active && impersonation ? t("actingAs", { email: impersonation.target_email }) : t("ended")}
        </p>
        <ReturnToAccount expiresAt={impersonation?.expires_at ?? null} />
      </div>
    </aside>
  );
}
