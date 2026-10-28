import { getTranslations, setRequestLocale } from "next-intl/server";
import { Baby, ChevronLeft } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { AddressSection } from "@/components/portal/family/address-section";
import { ChildHealthForm } from "@/components/portal/family/child-health-form";
import { GuardianSection } from "@/components/portal/family/guardian-section";
import { LanguageSection } from "@/components/portal/family/language-section";
import { PickupSection } from "@/components/portal/family/pickup-section";
import { getSiteSettings } from "@/lib/data";
import { getPortalContext } from "@/lib/portal/data";
import { getMyFamilies } from "@/lib/portal/family-data";

export default async function FamilyPage({ params }: PageProps<"/[locale]/min-side/familie">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const context = await getPortalContext();
  if (!context.user) redirect({ href: "/min-side/logg-inn", locale });

  const [t, tCommon, families, settings] = await Promise.all([
    getTranslations({ locale, namespace: "portal.family" }),
    getTranslations({ locale, namespace: "portal.common" }),
    getMyFamilies(),
    getSiteSettings(),
  ]);
  const contactEmail = settings?.contact_email;

  return (
    <div className="grid gap-8">
      <Link
        href="/min-side"
        className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 font-semibold text-brand-green-dark outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
        {t("back")}
      </Link>

      <header className="grid gap-2">
        <h1 className="font-heading text-3xl font-semibold text-balance">{t("title")}</h1>
        <p className="text-pretty text-muted-foreground">{t("intro")}</p>
      </header>

      {families.length === 0 ? (
        <div className="soft-card grid gap-4 p-6 sm:p-8">
          <h2 className="font-heading text-2xl font-semibold text-balance">{t("emptyTitle")}</h2>
          <p className="text-pretty text-muted-foreground">{t("empty", { email: context.email ?? "" })}</p>
          {contactEmail ? (
            <p className="text-pretty">
              {tCommon("writeTo")}{" "}
              <a
                href={`mailto:${contactEmail}`}
                className="rounded-sm font-semibold text-brand-green-dark underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {contactEmail}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      {families.map((family) => (
        <article
          key={family.id}
          data-testid="family-card"
          aria-labelledby={`family-${family.id}`}
          className="soft-card overflow-hidden"
        >
          <header className="grid gap-1 bg-primary/8 px-5 pt-5 pb-4 sm:px-6">
            <p className="text-sm font-semibold text-brand-green-dark">{t("familyLabel")}</p>
            <h2 id={`family-${family.id}`} className="font-heading text-2xl font-semibold text-balance">
              {family.display_name}
            </h2>
          </header>
          <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="grid content-start divide-y divide-foreground/8">
              <AddressSection family={family} />
              <GuardianSection family={family} />
              <PickupSection family={family} />
              <LanguageSection family={family} />
            </div>
            <section
              aria-labelledby={`children-${family.id}`}
              className="grid content-start gap-3 border-t border-foreground/8 px-5 py-5 sm:px-6 lg:border-t-0 lg:border-l"
            >
              <h3 id={`children-${family.id}`} className="flex items-center gap-2 font-heading text-lg font-semibold">
                <Baby aria-hidden="true" className="size-5 text-brand-green-dark" />
                {t("children.title")}
              </h3>
              {family.children.length ? (
                <ul className="grid gap-3">
                  {family.children.map((child) => (
                    <ChildHealthForm key={child.id} child={child} />
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">{t("children.none")}</p>
              )}
            </section>
          </div>
        </article>
      ))}
    </div>
  );
}
