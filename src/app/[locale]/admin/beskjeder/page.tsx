import { setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { adminBasePath } from "@/components/admin/paths";
import { AnnouncementList } from "@/components/announcements/list";

export const maxDuration = 60;

export default async function AnnouncementsPage({ params, searchParams }: PageProps<"/[locale]/admin/beskjeder">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const baseHref = `${adminBasePath(locale)}/beskjeder`;
  const page = z.coerce.number().int().min(1).max(10000).catch(1).parse(query.side);
  return <AnnouncementList locale={locale} baseHref={baseHref} page={page} />;
}
