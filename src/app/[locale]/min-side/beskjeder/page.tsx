import { setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { localePrefix, loginPath } from "@/components/admin/paths";
import { AnnouncementList } from "@/components/announcements/list";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";

export const maxDuration = 60;

export default async function AnnouncementsPage({ params, searchParams }: PageProps<"/[locale]/min-side/beskjeder">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const baseHref = `${localePrefix(locale)}/min-side/beskjeder`;
  if (!(await getUser())) redirect(`${loginPath(locale)}?next=${encodeURIComponent(baseHref)}`);
  const page = z.coerce.number().int().min(1).max(10000).catch(1).parse(query.side);
  return <AnnouncementList locale={locale} baseHref={baseHref} page={page} />;
}
