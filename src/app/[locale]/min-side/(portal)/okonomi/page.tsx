import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft, Wallet } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { FamilyEconomy } from "@/components/portal/economy/family-economy";
import { getPortalContext } from "@/lib/portal/data";
import { getMyEconomy } from "@/lib/portal/economy";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/min-side/okonomi">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal.economy" });
  return { title: t("metaTitle") };
}

export default async function EconomyPage({ params }: PageProps<"/[locale]/min-side/okonomi">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const context = await getPortalContext();
  if (!context.user) redirect({ href: "/min-side/logg-inn", locale });

  const [t, economy] = await Promise.all([
    getTranslations({ locale, namespace: "portal.economy" }),
    getMyEconomy(),
  ]);
  const families = economy.filter((family) => family.children.length > 0 || family.payments.length > 0);
  const yearLabel = families[0]?.school_year_label ?? economy[0]?.school_year_label;

  return (
    <div className="grid gap-8">
      <Link
        href="/min-side"
        className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 font-semibold text-brand-green-dark outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
        {t("back")}
      </Link>

      <header className="grid gap-1">
        <h1 className="font-heading text-3xl font-semibold text-balance">{t("title")}</h1>
        {yearLabel ? <p className="font-semibold text-brand-green-dark">{t("year", { year: yearLabel })}</p> : null}
      </header>

      {families.length ? (
        families.map((family) => (
          <FamilyEconomy key={family.family_id} family={family} locale={locale} showName={families.length > 1} />
        ))
      ) : (
        <section className="soft-card grid justify-items-start gap-2 px-5 py-6 sm:px-6">
          <Wallet aria-hidden="true" className="size-6 text-brand-green-dark" />
          <h2 className="font-heading text-xl font-semibold">{t("empty.title")}</h2>
          <p className="text-pretty text-foreground/75">{t("empty.text")}</p>
        </section>
      )}
    </div>
  );
}
