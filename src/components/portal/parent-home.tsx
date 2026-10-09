import { getTranslations } from "next-intl/server";
import { ChevronRight, ClipboardPen, HeartPulse, Mail, Users, Wallet } from "lucide-react";
import { localePrefix } from "@/components/admin/paths";
import { Link } from "@/i18n/navigation";
import { ChildCard } from "@/components/portal/parent/child-card";
import { AnnouncementInboxNotice } from "@/components/announcements/inbox-notice";
import { NextDay } from "@/components/portal/parent/next-day";
import { UpcomingList } from "@/components/portal/parent/upcoming-list";
import { formatNok } from "@/lib/money";
import { getMyFamilies } from "@/lib/portal/family-data";
import { absenceOptions, getParentData, getPortalEvents, missingFamilyInfo } from "@/lib/portal/parent-data";
import { currentTerm, summarizeAttendance } from "@/lib/portal/parent-format";

const RECENT_NOTE_DAYS = 7;

function daysBefore(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export async function ParentHome({ locale }: { locale: string }) {
  const [t, tHome, data, events, families] = await Promise.all([
    getTranslations({ locale, namespace: "portal.parent" }),
    getTranslations({ locale, namespace: "portal.home" }),
    getParentData(),
    getPortalEvents(),
    getMyFamilies(),
  ]);
  const { term, from, to } = currentTerm(data.today);
  const recentFrom = daysBefore(data.today, RECENT_NOTE_DAYS);
  const listFormat = new Intl.ListFormat(locale === "en" ? "en-GB" : "nb-NO", { type: "conjunction" });
  const reportedNames = new Map<string, string[]>();
  for (const report of data.reports) {
    const child = data.children.find((row) => row.student_id === report.student_id);
    if (!child?.first_name) continue;
    const names = reportedNames.get(report.school_day_id) ?? [];
    if (!names.includes(child.first_name)) names.push(child.first_name);
    reportedNames.set(report.school_day_id, names);
  }
  const contactHref = data.contactEmail
    ? `mailto:${data.contactEmail}`
    : `${localePrefix(locale)}/kontakt`;
  const rows = data.children.map((child) => ({
    child,
    options: absenceOptions(child, data.schoolDays.upcoming, data.reports, locale, data.today),
  }));
  const missing = missingFamilyInfo(families);
  const remaining = data.children.reduce((sum, child) => sum + Math.max(child.remaining_ore ?? 0, 0), 0);
  const tiles = [
    { href: "/min-side/familie", icon: Users, title: tHome("tiles.family"), text: tHome("tiles.familyText") },
    {
      href: "/min-side/okonomi",
      icon: Wallet,
      title: tHome("tiles.economy"),
      text: remaining > 0 ? tHome("tiles.economyDue", { amount: formatNok(remaining) }) : tHome("tiles.economyPaid"),
    },
    { href: "/min-side/pamelding", icon: ClipboardPen, title: tHome("tiles.enroll"), text: tHome("tiles.enrollText") },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section aria-labelledby="parent-home-title" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="parent-home-title" className="font-heading text-3xl font-semibold text-balance">
            {t("title")}
          </h2>
          <p className="text-pretty text-muted-foreground">
            {t("intro", { count: data.children.length, year: data.children[0]?.school_year_label ?? "" })}
          </p>
        </div>

        {missing.length ? (
          <Link
            href="/min-side/familie"
            className="flex items-start gap-3 rounded-2xl bg-brand-sun/25 p-4 outline-none transition-colors hover:bg-brand-sun/35 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <HeartPulse aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <span className="grid flex-1 gap-0.5">
              <span className="font-semibold text-pretty">
                {tHome("missing.title", { names: listFormat.format(missing) })}
              </span>
              <span className="text-sm text-pretty text-foreground/80">{tHome("missing.text")}</span>
            </span>
            <ChevronRight aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          </Link>
        ) : null}

        <AnnouncementInboxNotice locale={locale} />

        <div className="lg:hidden">
          <NextDay
            locale={locale}
            today={data.today}
            upcoming={data.schoolDays.upcoming}
            rows={rows}
            lessons={data.lessons}
            slots={data.slots}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
          {data.children.map((child) => {
            const classNotes = data.notesByClass.get(child.class_id) ?? [];
            const note = classNotes[0] ?? null;
            return (
              <ChildCard
                key={`${child.student_id}-${child.class_id}`}
                child={child}
                locale={locale}
                notes={classNotes.filter((row) => row.date === note?.date)}
                slots={data.slots}
                noteIsRecent={Boolean(note?.date && note.date >= recentFrom)}
                attendance={summarizeAttendance(data.attendance, child.student_id, { from, to }, data.today)}
                term={term}
              />
            );
          })}
        </div>
      </section>

      <aside className="grid gap-8 lg:sticky lg:top-36">
        <div className="hidden lg:block">
          <NextDay
            locale={locale}
            today={data.today}
            upcoming={data.schoolDays.upcoming}
            rows={rows}
            lessons={data.lessons}
            slots={data.slots}
          />
        </div>

        <nav aria-label={tHome("tiles.label")}>
          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {tiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <li key={tile.href}>
                  <Link
                    href={tile.href}
                    className="soft-card flex h-full items-start gap-3 p-4 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-col lg:flex-row"
                  >
                    <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-green-dark" />
                    <span className="grid gap-0.5">
                      <span className="font-heading text-lg font-semibold">{tile.title}</span>
                      <span className="text-sm text-pretty text-muted-foreground">{tile.text}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <UpcomingList
          locale={locale}
          days={data.schoolDays.upcoming.slice(0, 4)}
          events={events}
          reported={Object.fromEntries(
            [...reportedNames].map(([dayId, names]) => [dayId, listFormat.format(names)]),
          )}
        />

        <p className="flex items-start gap-2 text-pretty text-muted-foreground">
          <Mail aria-hidden="true" className="mt-1 size-4 shrink-0" />
          <span>
            {t("questions")}{" "}
            <a
              href={contactHref}
              className="rounded-sm font-semibold text-brand-green-dark underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {data.contactEmail ?? t("contactPage")}
            </a>
          </span>
        </p>
      </aside>
    </div>
  );
}
