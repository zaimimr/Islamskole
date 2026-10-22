import { Suspense } from "react";
import Link from "next/link";
import { CalendarDays, Clock3, MapPin, Pencil, Plus } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { getAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteEvent } from "@/app/[locale]/admin/actions";
import { siteUrl, localePath } from "@/lib/seo";
import { formatOsloDate, formatOsloDateTime, osloToday } from "@/lib/dates";
import { formatNok } from "@/lib/money";
import { formatSchoolDay } from "@/lib/portal/teacher-days";
import { statusLabel } from "@/lib/sfo/labels";
import { adminBasePath } from "@/components/admin/paths";
import { PageHeader } from "@/components/admin/page-header";
import { CopyLinkButton } from "@/components/admin/copy-link-button";
import { EmptyState } from "@/components/admin/empty-state";
import { LoadError } from "@/components/admin/load-error";
import { StatusPill, type StatusTone } from "@/components/admin/status-pill";
import { Pagination } from "@/components/admin/pagination";
import { ListCardSkeleton } from "@/components/admin/admin-skeletons";
import { buttonVariants } from "@/components/ui/button";
import { RowActions } from "@/components/ui/row-actions";

const PAGE_SIZE = 25;

type Item = {
  kind: "event" | "sfo";
  id: string;
  title: string;
  sortKey: number;
  upcoming: boolean;
  day: string | null;
  when: string;
  location: string | null;
  status: [string, StatusTone];
  extra: string | null;
  shareUrl: string | null;
};

type Search = { [key: string]: string | string[] | undefined };

async function loadItems(locale: Locale) {
  const client = await createClient();
  const now = Date.now();
  const today = osloToday();
  const [events, sfo] = await Promise.all([
    client.from("events").select("id, slug, title_no, starts_at, location, published").order("starts_at", { ascending: false }),
    client.from("school_activities").select("id, title, event_date, start_time, end_time, location, status, price_ore, capacity").eq("owner", "sfo").order("event_date", { ascending: false }),
  ]);
  if (events.error || sfo.error) return null;
  const ids = sfo.data.map((row) => row.id);
  const { data: responses } = ids.length ? await client.from("activity_responses").select("activity_id").eq("going", true).in("activity_id", ids) : { data: [] };
  const items: Item[] = [
    ...events.data.map((event): Item => {
      const time = event.starts_at ? new Date(event.starts_at).getTime() : Number.NaN;
      return {
        kind: "event", id: event.id, title: event.title_no ?? "Aktivitet uten tittel",
        sortKey: Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time, upcoming: Number.isNaN(time) || time >= now,
        day: Number.isNaN(time) ? null : event.starts_at, when: Number.isNaN(time) ? "Tidspunkt mangler" : formatOsloDateTime(event.starts_at),
        location: event.location, status: event.published ? ["Publisert", "ok"] : ["Utkast", "neutral"], extra: null,
        shareUrl: event.published && event.slug ? `${siteUrl}${localePath(locale, `/aktiviteter/${event.slug}`)}` : null,
      };
    }),
    ...sfo.data.map((activity): Item => {
      const going = (responses ?? []).filter((row) => row.activity_id === activity.id).length;
      const time = [activity.start_time?.slice(0, 5), activity.end_time?.slice(0, 5)].filter(Boolean).join("–");
      return {
        kind: "sfo", id: activity.id, title: activity.title,
        sortKey: new Date(`${activity.event_date}T${activity.start_time ?? "00:00"}`).getTime(), upcoming: activity.event_date >= today,
        day: activity.event_date, when: [formatSchoolDay(activity.event_date, "no"), time].filter(Boolean).join(" "),
        location: activity.location, status: statusLabel[activity.status] ?? ["Ukjent", "neutral"],
        extra: `Påmeldt: ${going}${activity.capacity ? ` / ${activity.capacity}` : ""}${activity.price_ore != null ? ` · ${formatNok(activity.price_ore)}` : ""}`,
        shareUrl: null,
      };
    }),
  ];
  return items;
}

function ItemList({ items, basePath, admin, emptyMessage }: { items: Item[]; basePath: string; admin: boolean; emptyMessage: string }) {
  if (items.length === 0) return <div className="px-5 py-8 text-center text-sm text-admin-muted">{emptyMessage}</div>;
  return <ul className="divide-y divide-[#ECE8DF]">
    {items.map((item) => {
      const href = item.kind === "sfo" ? `${basePath}/sfo/${item.id}` : `${basePath}/aktiviteter/${item.id}`;
      const editable = item.kind === "sfo" || admin;
      return <li key={`${item.kind}-${item.id}`} className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <time dateTime={item.day ?? undefined} className="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl bg-[#F7F6F1] text-center">
          <span className="font-heading text-xl leading-none font-bold tabular-nums">{item.day ? formatOsloDate(item.day, { day: "2-digit" }) : "--"}</span>
          <span className="mt-1 text-[0.6875rem] font-bold text-admin-muted uppercase">{item.day ? formatOsloDate(item.day, { month: "short" }) : "Dato"}</span>
        </time>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-bold">{item.title}</h3>
            <StatusPill tone={item.kind === "sfo" ? "info" : "neutral"}>{item.kind === "sfo" ? "SFO" : "Nettside"}</StatusPill>
            <StatusPill tone={item.status[1]}>{item.status[0]}</StatusPill>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-admin-muted">
            <span className="inline-flex items-center gap-1.5"><Clock3 aria-hidden="true" className="size-3.5" />{item.when}</span>
            <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden="true" className="size-3.5" />{item.location ?? "Sted mangler"}</span>
            {item.extra ? <span>{item.extra}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {item.shareUrl ? <CopyLinkButton url={item.shareUrl} showLabel /> : null}
          {editable ? <Link href={href} className={buttonVariants({ variant: "outline" })}><Pencil aria-hidden="true" className="size-4" />{item.kind === "sfo" ? "Åpne" : "Rediger"}</Link> : null}
          {item.kind === "event" && admin ? <RowActions label={`Flere valg for ${item.title}`} destructive={{
            id: item.id, label: "Slett aktivitet", title: "Slette aktiviteten?",
            description: "Aktiviteten fjernes fra nettsiden og kan ikke hentes tilbake. Vil du bare skjule den, gjør den til utkast i stedet.",
            successMessage: "Aktiviteten er slettet", action: deleteEvent,
          }} /> : null}
        </div>
      </li>;
    })}
  </ul>;
}

async function ClassActivities() {
  const { data, error } = await (await createClient()).rpc("class_activity_overview");
  return <section aria-labelledby="class-activities" className="grid gap-3">
    <h2 id="class-activities" className="font-heading text-xl font-bold">Klasseaktiviteter</h2>
    {error ? <p role="status">Kunne ikke hente klasseaktiviteter</p> : !data?.length ? <p className="text-sm text-admin-muted">Ingen klasseaktiviteter</p>
      : <ul className="grid gap-3 lg:grid-cols-2">{data.map((row) => {
        const [label, tone] = statusLabel[row.status] ?? ["Ukjent", "neutral"];
        return <li key={row.id} className="grid gap-2 rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3]">
          <span className="flex flex-wrap items-center gap-2"><span className="font-bold wrap-anywhere">{row.title}</span><StatusPill tone={tone}>{label}</StatusPill></span>
          <span className="text-sm text-admin-muted">{row.class_name} · {formatSchoolDay(row.event_date, "no")}</span>
          <span className="text-sm">Deltar: {row.going} · Deltar ikke: {row.not_going} · Mangler svar: {row.missing}</span>
        </li>;
      })}</ul>}
  </section>;
}

async function ActivitySections({ locale, sp, listPath, admin }: { locale: Locale; sp: Search; listPath: string; admin: boolean }) {
  const basePath = adminBasePath(locale);
  const items = await loadItems(locale);
  if (!items) return <LoadError title="Aktivitetene kunne ikke lastes" retryHref={listPath} />;
  if (items.length === 0) return <section className="rounded-2xl bg-white ring-1 ring-[#E3DED3]"><EmptyState icon={<CalendarDays aria-hidden="true" />} title="Ingen aktiviteter ennå" /></section>;
  const upcoming = items.filter((item) => item.upcoming).sort((a, b) => a.sortKey - b.sortKey);
  const past = items.filter((item) => !item.upcoming).sort((a, b) => b.sortKey - a.sortKey);
  const pageCount = Math.max(1, Math.ceil(past.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), pageCount);
  return <>
    <section aria-labelledby="activities-upcoming" className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
      <h2 id="activities-upcoming" className="border-b border-[#ECE8DF] px-4 py-4 font-heading text-xl font-bold sm:px-5">Kommende og uten dato</h2>
      <ItemList items={upcoming} basePath={basePath} admin={admin} emptyMessage="Ingen kommende aktiviteter." />
    </section>
    <section aria-labelledby="activities-past" className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
      <h2 id="activities-past" className="border-b border-[#ECE8DF] px-4 py-4 font-heading text-xl font-bold sm:px-5">Tidligere aktiviteter</h2>
      <ItemList items={past.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)} basePath={basePath} admin={admin} emptyMessage="Ingen tidligere aktiviteter." />
      {past.length > 0 ? <Pagination page={page} pageSize={PAGE_SIZE} total={past.length} basePath={listPath} searchParams={sp} /> : null}
    </section>
  </>;
}

export async function ActivityHub({ locale, sp, listPath }: { locale: Locale; sp: Search; listPath: string }) {
  const basePath = adminBasePath(locale);
  const access = await getAccess();
  const canSfo = access.permissions.has("activities.sfo.manage");
  return <div className="grid gap-6 lg:gap-7">
    <PageHeader title="Aktiviteter"
      action={access.admin ? <Link href={`${basePath}/aktiviteter/ny`} className={buttonVariants({ variant: "outline", className: "min-h-11 rounded-xl font-bold" })}><Plus aria-hidden="true" className="size-4" />Nytt arrangement</Link> : undefined}
      newHref={canSfo ? `${basePath}/sfo/ny` : undefined} newLabel="Ny SFO-aktivitet" />
    <Suspense fallback={<><ListCardSkeleton rows={2} lead="tile" /><ListCardSkeleton rows={3} lead="tile" /></>}>
      <ActivitySections locale={locale} sp={sp} listPath={listPath} admin={access.admin} />
    </Suspense>
    {access.permissions.has("activities.class.read") ? <Suspense fallback={<ListCardSkeleton rows={2} />}><ClassActivities /></Suspense> : null}
  </div>;
}
