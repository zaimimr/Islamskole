import { getTranslations } from "next-intl/server";
import { CircleCheck, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getPendingAcknowledgementCount } from "@/lib/announcements/data";

export async function AnnouncementInboxNotice({ locale }: { locale: string }) {
  const [count, t] = await Promise.all([getPendingAcknowledgementCount(), getTranslations({ locale, namespace: "announcements" })]);
  if (!count) return null;
  return <Link href="/min-side/beskjeder" className="flex min-h-11 items-center gap-3 rounded-xl bg-brand-sun/25 p-4 font-semibold outline-none hover:bg-brand-sun/35 focus-visible:ring-3 focus-visible:ring-ring/50">
    <CircleCheck aria-hidden="true" className="size-5 shrink-0" /><span className="min-w-0 flex-1">{t("pendingLink", { count })}</span><ChevronRight aria-hidden="true" className="size-5 shrink-0" />
  </Link>;
}
