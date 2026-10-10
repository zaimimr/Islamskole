import { getTranslations } from "next-intl/server";
import { ChevronDown } from "lucide-react";
import { entryLabel, weekHeading, WeekEntryContent } from "@/components/semester-plan/week-entry";
import type { TimeSlot } from "@/lib/lessons";
import { entriesByWeek, focusWeek, planWeeks, weekPhase, type PlanWeek, type WeekPlanEntry } from "@/lib/semester-plan";
import { cn } from "@/lib/utils";

export async function WeekPlanView({
  id,
  entries,
  days,
  slots,
  locale,
  today,
}: {
  id: string;
  entries: WeekPlanEntry[];
  days: { date: string; cancelled: boolean }[];
  slots: TimeSlot[];
  locale: string;
  today: string;
}) {
  if (!entries.length) return null;
  const t = await getTranslations({ locale, namespace: "portal.semesterPlan" });
  const byWeek = entriesByWeek(entries);
  const weeks = planWeeks(days, entries).filter((week) => byWeek.has(week.weekStart));
  const focus = focusWeek(weeks, today);
  const past = weeks.filter((week) => focus === null || week.weekStart < focus).reverse();
  const coming = weeks.filter((week) => focus !== null && week.weekStart >= focus);

  const renderWeek = (week: PlanWeek) => {
    const heading = weekHeading(week.weekStart, week.dates, locale);
    const isFocus = week.weekStart === focus;
    const rows = byWeek.get(week.weekStart) ?? [];
    return (
      <li
        key={week.weekStart}
        data-week={week.weekStart}
        aria-current={isFocus ? "date" : undefined}
        className={cn(
          "grid gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/8 sm:p-5",
          isFocus && "ring-2 ring-primary/60",
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="font-heading text-lg font-semibold">
            {t("week", { number: heading.number })}
            {heading.days ? (
              <span className="font-sans text-sm font-normal text-foreground/70"> · {heading.days}</span>
            ) : null}
          </h3>
          {isFocus ? (
            <span className="rounded-full bg-primary/12 px-3 py-1 text-sm font-semibold text-brand-green-dark">
              {weekPhase(week.weekStart, today) === "current" ? t("current") : t("next")}
            </span>
          ) : null}
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((entry) => (
            <li key={entry.id} className="rounded-xl bg-muted/50 p-3">
              <WeekEntryContent entry={entry} label={entryLabel(entry, slots, t("general"))} linkLabel={t("resource")} locale={locale} />
            </li>
          ))}
        </ul>
      </li>
    );
  };

  return (
    <section aria-labelledby={id} className="grid gap-4">
      <div className="grid gap-1">
        <h2 id={id} className="font-heading text-xl font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-foreground/75">{t("intro")}</p>
      </div>
      {coming.length ? <ol className="grid gap-3">{coming.map(renderWeek)}</ol> : null}
      {past.length ? (
        <details className="group grid gap-3">
          <summary className="inline-flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg font-semibold text-brand-green-dark outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
            {t("past", { count: past.length })}
          </summary>
          <ol className="mt-3 grid gap-3">{past.map(renderWeek)}</ol>
        </details>
      ) : null}
    </section>
  );
}
