import { setRequestLocale } from "next-intl/server";
import { z } from "zod";
import Link from "next/link";
import { getIsAdmin } from "@/lib/auth";
import { adminBasePath } from "@/components/admin/paths";
import { AnnouncementList } from "@/components/announcements/list";

export const maxDuration = 60;

export default async function AnnouncementsPage({ params, searchParams }: PageProps<"/[locale]/admin/beskjeder">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const baseHref = `${adminBasePath(locale)}/beskjeder`;
  const page = z.coerce.number().int().min(1).max(10000).catch(1).parse(query.side);
  const isAdmin = await getIsAdmin();
  return <div className="grid gap-4">
    {isAdmin ? <Link href={`${baseHref}/epost`} className="inline-flex min-h-11 items-center justify-self-end font-semibold text-admin-action">{locale === "en" ? "Email delivery" : "E-postutsending"}</Link> : null}
    <AnnouncementList locale={locale} baseHref={baseHref} page={page} />
  </div>;
}
