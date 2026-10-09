import { setRequestLocale } from "next-intl/server";
import { localePrefix, loginPath } from "@/components/admin/paths";
import { AnnouncementDetail } from "@/components/announcements/detail";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";

export const maxDuration = 60;

export default async function AnnouncementPage({ params }: PageProps<"/[locale]/min-side/beskjeder/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const baseHref = `${localePrefix(locale)}/min-side/beskjeder`;
  if (!(await getUser())) redirect(`${loginPath(locale)}?next=${encodeURIComponent(`${baseHref}/${id}`)}`);
  return <AnnouncementDetail id={id} locale={locale} baseHref={baseHref} />;
}
