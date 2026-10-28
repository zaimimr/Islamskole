import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeftIcon, CakeIcon, UsersIcon, BookOpenIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getClassBySlug, getPublishedClasses, localized } from "@/lib/data";
import { contentMetadata, courseJsonLd } from "@/lib/seo";
import { MediaFrame } from "@/components/site/MediaFrame";
import { EnrollCta } from "@/components/site/EnrollCta";
import { Blob } from "@/components/site/decor";

export async function generateStaticParams() {
  const classes = await getPublishedClasses();
  return classes.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/klasser/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const item = await getClassBySlug(slug);
  if (!item) return { title: "Islamskole Bærum" };
  const typedLocale = locale as Locale;
  const name = localized(item, "name", typedLocale);
  return contentMetadata({
    locale: typedLocale,
    title: name,
    description:
      localized(item, "description", typedLocale).slice(0, 160) ||
      `${name} - islamsk søndagsskole i Bærum.`,
    basePath: `/klasser/${item.slug}`,
    image: item.image_url,
  });
}

export default async function ClassDetailPage({
  params,
}: PageProps<"/[locale]/klasser/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const typedLocale = locale as Locale;

  const item = await getClassBySlug(slug);
  if (!item) notFound();

  const t = await getTranslations("classes");
  const tCommon = await getTranslations("common");
  const name = localized(item, "name", typedLocale);
  const description = localized(item, "description", typedLocale);
  const curriculum = localized(item, "curriculum", typedLocale);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            courseJsonLd({
              name,
              description,
              basePath: `/klasser/${item.slug}`,
              image: item.image_url,
            }),
          ),
        }}
      />
      <section className="relative overflow-hidden bg-gradient-to-b from-secondary/45 via-background to-background">
        <Blob className="-top-20 -right-16 h-64 w-64 text-primary/12 animate-float" />
        <div className="section-shell relative pt-10 pb-16 sm:pt-14">
          <Link
            href="/klasser"
            className="-my-2.5 inline-flex items-center gap-1.5 py-2.5 text-sm font-semibold text-brand-green-dark outline-none hover:underline focus-visible:underline"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            {tCommon("backToClasses")}
          </Link>
          <div className="mt-8 grid items-center gap-10 lg:grid-cols-2">
            <div className="flex flex-col gap-5">
              <h1 className="text-4xl leading-tight font-bold text-balance-pretty sm:text-5xl">
                {name}
              </h1>
              <div className="flex flex-wrap gap-2.5">
                {item.age_min != null && item.age_max != null && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground">
                    <CakeIcon className="size-4" aria-hidden="true" />
                    {t("ageLabel")}: {t("ageYears", { min: item.age_min, max: item.age_max })}
                  </span>
                )}
                {item.capacity != null && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
                    <UsersIcon className="size-4" aria-hidden="true" />
                    {t("capacityLabel")}: {t("capacityValue", { count: item.capacity })}
                  </span>
                )}
              </div>
            </div>
            <MediaFrame
              src={item.image_url}
              alt={name}
              tone="sky"
              priority
              sizes="(min-width: 1024px) 45vw, 100vw"
              className="aspect-[4/3] rounded-[2.2rem] shadow-[0_30px_70px_-40px_rgba(20,60,30,0.5)] ring-1 ring-foreground/10"
            />
          </div>
        </div>
      </section>

      <div className="section-shell grid gap-10 py-14 lg:grid-cols-3">
        {description && (
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold">{t("descriptionLabel")}</h2>
            <p className="mt-4 text-lg whitespace-pre-line text-muted-foreground text-balance-pretty">
              {description}
            </p>
          </div>
        )}
        {curriculum && (
          <aside className="soft-card flex flex-col gap-3 self-start p-7">
            <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-brand-green-dark">
              <BookOpenIcon className="size-6" aria-hidden="true" />
            </span>
            <h2 className="text-xl font-bold">{t("curriculumLabel")}</h2>
            <p className="whitespace-pre-line text-base text-muted-foreground text-balance-pretty">
              {curriculum}
            </p>
          </aside>
        )}
      </div>

      <EnrollCta />
    </>
  );
}
