import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getPublicSfoActivities, getPublishedEvents } from "@/lib/data";
import { PageHeader } from "@/components/site/PageHeader";
import { Section, SectionHeading } from "@/components/site/Section";
import { EventCard } from "@/components/site/EventCard";
import { SfoActivityCard } from "@/components/site/SfoActivityCard";
import { EmptyState } from "@/components/site/EmptyState";
import { isUpcoming } from "@/components/site/format";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/aktiviteter">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "events" });
  return { title: t("title"), description: t("subtitle") };
}

export default async function EventsPage({
  params,
}: PageProps<"/[locale]/aktiviteter">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const typedLocale = locale as Locale;

  const t = await getTranslations("events");
  const [events, sfo] = await Promise.all([getPublishedEvents(), getPublicSfoActivities()]);

  const upcoming = events.filter((e) => isUpcoming(e.starts_at, e.ends_at));
  const past = events
    .filter((e) => !isUpcoming(e.starts_at, e.ends_at))
    .reverse();

  return (
    <>
      <PageHeader
        eyebrow={t("title")}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <Section className="bg-card" ariaLabelledby="upcoming-heading">
        <SectionHeading
          id="upcoming-heading"
          align="left"
          title={t("upcoming")}
        />
        <div className="mt-10">
          {upcoming.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((item) => (
                <EventCard key={item.id} item={item} locale={typedLocale} />
              ))}
            </div>
          ) : (
            <EmptyState message={t("emptyUpcoming")} />
          )}
        </div>
      </Section>

      {sfo.length > 0 && (
        <Section ariaLabelledby="sfo-heading">
          <SectionHeading id="sfo-heading" align="left" title={t("sfoTitle")} />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {sfo.map((item) => (
              <SfoActivityCard key={item.id} item={item} locale={typedLocale} />
            ))}
          </div>
        </Section>
      )}

      <Section className={sfo.length > 0 ? "bg-card" : undefined} ariaLabelledby="past-heading">
        <SectionHeading id="past-heading" align="left" title={t("past")} />
        <div className="mt-10">
          {past.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {past.map((item) => (
                <EventCard key={item.id} item={item} locale={typedLocale} />
              ))}
            </div>
          ) : (
            <EmptyState message={t("emptyPast")} />
          )}
        </div>
      </Section>
    </>
  );
}
