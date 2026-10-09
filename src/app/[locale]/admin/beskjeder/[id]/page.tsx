import { setRequestLocale } from "next-intl/server";
import { adminBasePath } from "@/components/admin/paths";
import { AnnouncementDetail } from "@/components/announcements/detail";

export const maxDuration = 60;

export default async function AnnouncementPage({ params }: PageProps<"/[locale]/admin/beskjeder/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const baseHref = `${adminBasePath(locale)}/beskjeder`;
  return <AnnouncementDetail id={id} locale={locale} baseHref={baseHref} />;
}
