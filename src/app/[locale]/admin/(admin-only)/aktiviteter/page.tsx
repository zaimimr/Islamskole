import type { Metadata } from "next";
import type { Locale } from "@/i18n/routing";
import { adminBasePath } from "@/components/admin/paths";
import { ActivityHub } from "@/components/admin/activity-hub";

export const metadata: Metadata = { title: "Aktiviteter" };

export default async function AktiviteterPage({ params, searchParams }: PageProps<"/[locale]/admin/aktiviteter">) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  return <ActivityHub locale={locale as Locale} sp={sp} listPath={`${adminBasePath(locale)}/aktiviteter`} />;
}
