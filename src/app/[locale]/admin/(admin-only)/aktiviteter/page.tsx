import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { CalendarDays, Clock3, MapPin, Pencil, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { deleteEvent } from "@/app/[locale]/admin/actions";
import { adminBasePath } from "@/components/admin/paths";
import { siteUrl, localePath } from "@/lib/seo";
import { formatOsloDate, formatOsloDateTime } from "@/lib/dates";
import { CopyLinkButton } from "@/components/admin/copy-link-button";
import { EmptyState } from "@/components/admin/empty-state";
import { LoadError } from "@/components/admin/load-error";
import { StatusPill } from "@/components/admin/status-pill";
import { Pagination } from "@/components/admin/pagination";
import { ListCardSkeleton } from "@/components/admin/admin-skeletons";
import { buttonVariants } from "@/components/ui/button";
import { RowActions } from "@/components/ui/row-actions";

export const metadata: Metadata = { title: "Aktiviteter" };

const PAGE_SIZE = 25;

type EventRow = {
  id: string;
  slug: string | null;
  title_no: string | null;
  starts_at: string | null;
  location: string | null;
  published: boolean | null;
};

async function getEvents(): Promise<
  { ok: true; rows: EventRow[]; requestedAt: number } | { ok: false }
> {
  const requestedAt = Date.now();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("events")
      .select("id, slug, title_no, starts_at, location, published")
      .order("starts_at", { ascending: false });
    if (error) return { ok: false };
    return { ok: true, rows: (data as EventRow[] | null) ?? [], requestedAt };
  } catch {
    return { ok: false };
  }
}

function eventDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDay(value: string | null) {
  if (!eventDate(value)) return "--";
  return formatOsloDate(value, { day: "2-digit" });
}

function formatMonth(value: string | null) {
  if (!eventDate(value)) return "Dato";
  return formatOsloDate(value, { month: "short" });
}

function formatDateTime(value: string | null) {
  if (!eventDate(value)) return "Tidspunkt mangler";
  return formatOsloDateTime(value);
}

function EventList({
  events,
  basePath,
  locale,
  emptyMessage,
}: {
  events: EventRow[];
  basePath: string;
  locale: Locale;
  emptyMessage: string;
}) {
  if (events.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-sm text-admin-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[#ECE8DF]">
      {events.map((event) => (
        <li
          key={event.id}
          className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center"
        >
          <time
            dateTime={event.starts_at ?? undefined}
            className="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl bg-[#F7F6F1] text-center"
          >
            <span className="font-heading text-xl leading-none font-bold tabular-nums">
              {formatDay(event.starts_at)}
            </span>
            <span className="mt-1 text-[0.6875rem] font-bold text-admin-muted uppercase">
              {formatMonth(event.starts_at)}
            </span>
          </time>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-bold">
                {event.title_no ?? "Aktivitet uten tittel"}
              </h3>
              <StatusPill tone={event.published ? "ok" : "neutral"}>
                {event.published ? "Publisert" : "Utkast"}
              </StatusPill>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-admin-muted">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 aria-hidden="true" className="size-3.5" />
                {formatDateTime(event.starts_at)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin aria-hidden="true" className="size-3.5" />
                {event.location ?? "Sted mangler"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {event.published && event.slug ? (
              <CopyLinkButton
                url={`${siteUrl}${localePath(
                  locale,
                  `/aktiviteter/${event.slug}`,
                )}`}
                showLabel
              />
            ) : null}
            <Link
              href={`${basePath}/aktiviteter/${event.id}`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Pencil aria-hidden="true" className="size-4" />
              Rediger
            </Link>
            <RowActions
              label={`Flere valg for ${event.title_no ?? "aktiviteten"}`}
              destructive={{
                id: event.id,
                label: "Slett aktivitet",
                title: "Slette aktiviteten?",
                description:
                  "Aktiviteten fjernes fra nettsiden og kan ikke hentes tilbake. Vil du bare skjule den, gjør den til utkast i stedet.",
                successMessage: "Aktiviteten er slettet",
                action: deleteEvent,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

async function EventSections({
  basePath,
  locale,
  sp,
}: {
  basePath: string;
  locale: Locale;
  sp: { [key: string]: string | string[] | undefined };
}) {
  const requestedPage = Math.max(1, Number(sp.page) || 1);
  const result = await getEvents();
  if (!result.ok) {
    return (
      <LoadError
        title="Aktivitetene kunne ikke lastes"
        retryHref={`${basePath}/aktiviteter`}
      />
    );
  }
  const { rows: events, requestedAt } = result;
  const upcomingEvents = events
    .filter((event) => {
      const date = eventDate(event.starts_at);
      return date ? date.getTime() >= requestedAt : true;
    })
    .sort(
      (first, second) =>
        (eventDate(first.starts_at)?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (eventDate(second.starts_at)?.getTime() ?? Number.MAX_SAFE_INTEGER),
    );
  const previousEvents = events.filter((event) => {
    const date = eventDate(event.starts_at);
    return date ? date.getTime() < requestedAt : false;
  });
  const previousPageCount = Math.max(
    1,
    Math.ceil(previousEvents.length / PAGE_SIZE),
  );
  const previousPage = Math.min(requestedPage, previousPageCount);
  const visiblePreviousEvents = previousEvents.slice(
    (previousPage - 1) * PAGE_SIZE,
    previousPage * PAGE_SIZE,
  );

  return events.length === 0 ? (
    <section className="rounded-2xl bg-white ring-1 ring-[#E3DED3]">
      <EmptyState
        icon={<CalendarDays aria-hidden="true" />}
        title="Ingen aktiviteter ennå"
        description="Opprett en aktivitet og publiser den når innholdet er klart."
        action={
          <Link
            href={`${basePath}/aktiviteter/ny`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#CFC8BA] px-4 text-sm font-bold text-[#277A31] outline-none transition-colors hover:bg-[#F7FBF7] focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Plus aria-hidden="true" className="size-4" />
            Opprett aktivitet
          </Link>
        }
      />
    </section>
  ) : (
    <>
      <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
        <div className="border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
          <h2 className="font-heading text-xl font-bold">
            Kommende og uten dato
          </h2>
          <p className="mt-0.5 text-sm text-admin-muted">
            Innhold som fortsatt skal følges opp eller deles.
          </p>
        </div>
        <EventList
          events={upcomingEvents}
          basePath={basePath}
          locale={locale as Locale}
          emptyMessage="Ingen kommende aktiviteter."
        />
      </section>

      <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
        <div className="border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
          <h2 className="font-heading text-xl font-bold">
            Tidligere aktiviteter
          </h2>
          <p className="mt-0.5 text-sm text-admin-muted">
            Publisert innhold og utkast fra tidligere datoer.
          </p>
        </div>
        <EventList
          events={visiblePreviousEvents}
          basePath={basePath}
          locale={locale as Locale}
          emptyMessage="Ingen tidligere aktiviteter."
        />
        {previousEvents.length > 0 ? (
          <Pagination
            page={previousPage}
            pageSize={PAGE_SIZE}
            total={previousEvents.length}
            basePath={`${basePath}/aktiviteter`}
            searchParams={sp}
          />
        ) : null}
      </section>
    </>
  );
}

export default async function AktiviteterPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/aktiviteter">) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const basePath = adminBasePath(locale);
  return (
    <div className="grid gap-6 lg:gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
            Aktiviteter
          </h1>
          <p className="mt-1 max-w-2xl text-admin-muted">
            Planlegg, publiser og finn igjen skolens arrangementer og nyheter.
          </p>
        </div>
        <Link
          href={`${basePath}/aktiviteter/ny`}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-admin-action px-4 text-sm font-bold text-white outline-none transition-colors hover:bg-[#245E2B] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Plus aria-hidden="true" className="size-4" />
          Ny aktivitet
        </Link>
      </header>

      <Suspense
        fallback={
          <>
            <ListCardSkeleton rows={2} lead="tile" />
            <ListCardSkeleton rows={3} lead="tile" />
          </>
        }
      >
        <EventSections basePath={basePath} locale={locale as Locale} sp={sp} />
      </Suspense>
    </div>
  );
}
