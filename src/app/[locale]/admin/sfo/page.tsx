import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminBasePath, localePrefix } from "@/components/admin/paths";
import { PageHeader } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/status-pill";
import { statusLabel } from "@/lib/sfo/labels";
import { EmptyState } from "@/components/admin/empty-state";
import { LoadError } from "@/components/admin/load-error";
import { formatNok } from "@/lib/money";
import { formatSchoolDay } from "@/lib/portal/teacher-days";

export const metadata: Metadata = { title: "SFO" };

export default async function SfoPage({ params }: PageProps<"/[locale]/admin/sfo">) {
  const { locale } = await params;
  const access = await getAccess();
  if (!access.admin && access.permissions.size === 0) redirect(`${localePrefix(locale)}/min-side`);
  const basePath = adminBasePath(locale);
  const client = await createClient();
  const canClass = access.permissions.has("activities.class.read");
  const [{ data, error }, overview] = await Promise.all([
    client.from("school_activities").select("id, title, event_date, start_time, location, status, price_ore, capacity").eq("owner", "sfo").order("event_date", { ascending: false }),
    canClass ? client.rpc("class_activity_overview") : Promise.resolve({ data: [], error: null }),
  ]);
  const { data: responses } = data?.length ? await client.from("activity_responses").select("activity_id").eq("going", true).in("activity_id", data.map((row) => row.id)) : { data: [] };
  if (error) return <LoadError title="Kunne ikke hente SFO-aktiviteter" retryHref={`${basePath}/sfo`} />;
  return <div className="grid gap-8">
    <PageHeader title="SFO" newHref={access.permissions.has("activities.sfo.manage") ? `${basePath}/sfo/ny` : undefined} newLabel="Ny aktivitet" />
    <section aria-labelledby="sfo-activities" className="grid gap-3">
      <h2 id="sfo-activities" className="font-heading text-xl font-bold">Aktiviteter</h2>
      {data.length === 0 ? <EmptyState title="Ingen aktiviteter ennå" /> : <ul className="grid gap-3 lg:grid-cols-2">{data.map((activity) => {
        const [label, tone] = statusLabel[activity.status] ?? ["Ukjent", "neutral"];
        const going = (responses ?? []).filter((row) => row.activity_id === activity.id).length;
        return <li key={activity.id}><Link href={`${basePath}/sfo/${activity.id}`} className="grid gap-2 rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3] outline-none transition-colors hover:bg-[#F7FBF7] focus-visible:ring-3 focus-visible:ring-ring/50">
          <span className="flex flex-wrap items-center gap-2"><span className="font-bold wrap-anywhere">{activity.title}</span><StatusPill tone={tone}>{label}</StatusPill></span>
          <span className="text-sm text-admin-muted">{[formatSchoolDay(activity.event_date, "no"), activity.start_time?.slice(0, 5), activity.location].filter(Boolean).join(" · ")}</span>
          <span className="text-sm">Påmeldt: {going}{activity.capacity ? ` / ${activity.capacity}` : ""}{activity.price_ore != null ? ` · ${formatNok(activity.price_ore)}` : ""}</span>
        </Link></li>;
      })}</ul>}
    </section>
    {canClass ? <section aria-labelledby="class-activities" className="grid gap-3">
      <h2 id="class-activities" className="font-heading text-xl font-bold">Klasseaktiviteter</h2>
      {overview.error ? <p role="status">Kunne ikke hente klasseaktiviteter</p> : !overview.data?.length ? <p className="text-sm text-admin-muted">Ingen klasseaktiviteter</p>
        : <ul className="grid gap-3 lg:grid-cols-2">{overview.data.map((row) => {
          const [label, tone] = statusLabel[row.status] ?? ["Ukjent", "neutral"];
          return <li key={row.id} className="grid gap-2 rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3]">
            <span className="flex flex-wrap items-center gap-2"><span className="font-bold wrap-anywhere">{row.title}</span><StatusPill tone={tone}>{label}</StatusPill></span>
            <span className="text-sm text-admin-muted">{row.class_name} · {formatSchoolDay(row.event_date, "no")}</span>
            <span className="text-sm">Deltar: {row.going} · Deltar ikke: {row.not_going} · Mangler svar: {row.missing}</span>
          </li>;
        })}</ul>}
    </section> : null}
  </div>;
}
