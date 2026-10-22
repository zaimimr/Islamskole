import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { getAccess } from "@/lib/auth";
import { adminBasePath, localePrefix } from "@/components/admin/paths";
import { ActivityHub } from "@/components/admin/activity-hub";

export const metadata: Metadata = { title: "Aktiviteter" };

export default async function SfoPage({ params, searchParams }: PageProps<"/[locale]/admin/sfo">) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const access = await getAccess();
  if (!access.admin && access.permissions.size === 0) redirect(`${localePrefix(locale)}/min-side`);
  return <ActivityHub locale={locale as Locale} sp={sp} listPath={`${adminBasePath(locale)}/sfo`} />;
}
