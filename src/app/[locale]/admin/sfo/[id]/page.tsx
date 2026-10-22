import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { osloToday } from "@/lib/dates";
import { formatNok } from "@/lib/money";
import { formatSchoolDay } from "@/lib/portal/teacher-days";
import { statusLabel } from "@/lib/sfo/labels";
import { adminBasePath, localePrefix } from "@/components/admin/paths";
import { PageHeader } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/status-pill";
import { SfoActivityForm } from "@/components/sfo/sfo-activity-form";
import { SfoCancel } from "@/components/sfo/sfo-cancel";
import { SfoCashForm } from "@/components/sfo/sfo-cash-form";
import { ParticipationButtons } from "@/components/school-activities/participation-buttons";
import { PrintRoster } from "@/components/school-activities/print-roster";

export const metadata: Metadata = { title: "SFO-aktivitet" };

type Person = { name: string; phone: string | null; relation?: string | null };

const card = "rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3] sm:p-6";

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export default async function SfoActivityPage({ params }: PageProps<"/[locale]/admin/sfo/[id]">) {
  const { locale, id } = await params;
  const access = await getAccess();
  if (!access.admin && access.permissions.size === 0) redirect(`${localePrefix(locale)}/min-side`);
  const basePath = adminBasePath(locale);
  const client = await createClient();
  const { data: activity } = await client.from("school_activities").select("*").eq("id", id).eq("owner", "sfo").maybeSingle();
  if (!activity) notFound();
  const today = osloToday();
  const can = (permission: Parameters<typeof access.permissions.has>[0]) => access.permissions.has(permission);
  const live = activity.status !== "draft";
  const showRoster = can("activities.sfo.roster") && live && today <= addDays(activity.event_date, 30);
  const showPayments = can("activities.sfo.payments") && live && activity.price_ore != null;
  const showRefunds = access.admin && activity.status === "cancelled" && activity.price_ore != null;
  const [{ data: audience }, { data: classes }, roster, payments, refunds] = await Promise.all([
    client.from("activity_audience").select("class_id").eq("activity_id", id),
    client.from("classes").select("id, name_no").eq("published", true).order("sort_order"),
    showRoster ? client.rpc("sfo_activity_roster", { p_id: id }) : Promise.resolve({ data: null, error: null }),
    showPayments ? client.rpc("sfo_activity_payments", { p_id: id }) : Promise.resolve({ data: null, error: null }),
    showRefunds ? client.rpc("activity_refunds", { p_id: id }) : Promise.resolve({ data: null, error: null }),
  ]);
  const [label, tone] = statusLabel[activity.status] ?? ["Ukjent", "neutral"];
  const going = roster.data?.filter((row) => row.going) ?? [];
  const health = going.filter((row) => row.allergies || row.medical_notes);
  const time = [activity.start_time?.slice(0, 5), activity.end_time?.slice(0, 5)].filter(Boolean).join("–");
  const unpaid = (payments.data ?? []).filter((row) => row.going && row.paid_ore < (activity.price_ore ?? 0));

  return <div className="grid gap-6">
    <Link href={`${basePath}/${access.admin ? "aktiviteter" : "sfo"}`} className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm font-bold print:hidden"><ChevronLeft aria-hidden="true" className="size-4" />Aktiviteter</Link>
    <PageHeader title={activity.title} action={<StatusPill tone={tone}>{label}</StatusPill>} />
    <p className="-mt-4 text-admin-muted">{[formatSchoolDay(activity.event_date, "no"), time, activity.location].filter(Boolean).join(" · ")}</p>

    {can("activities.sfo.manage") && activity.status !== "cancelled" ? <div className="grid gap-4 print:hidden">
      <SfoActivityForm key={activity.updated_at} initial={activity} audience={(audience ?? []).map((row) => row.class_id)} classes={(classes ?? []).map((row) => ({ id: row.id, name: row.name_no }))} basePath={basePath} />
      {activity.status === "published" ? <SfoCancel activityId={activity.id} expected={activity.updated_at} priced={activity.price_ore != null} /> : null}
    </div> : null}

    {showRoster ? <section aria-labelledby="sfo-roster" className={`${card} grid gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="sfo-roster" className="font-heading text-xl font-bold">Deltakere</h2><PrintRoster locale="no" /></div>
      {roster.error ? <p role="status">Kunne ikke hente deltakerlisten</p> : <>
        <p className="font-semibold">Deltar: {going.length}{activity.capacity ? ` / ${activity.capacity}` : ""} · Deltar ikke: {(roster.data ?? []).length - going.length}</p>
        {health.length ? <div className="grid gap-1 rounded-xl bg-[#FEF3D7] p-4"><p className="font-bold">Allergier og helse</p>{health.map((row) => <p key={row.student_id}><span className="font-semibold">{row.name}</span>: {[row.allergies, row.medical_notes].filter(Boolean).join(" · ")}</p>)}</div> : null}
        <ul className="grid gap-3 lg:grid-cols-2">{(roster.data ?? []).map((row) => {
          const guardians = (row.guardians as Person[] | null) ?? [];
          const pickup = (row.pickup as Person[] | null) ?? [];
          return <li key={row.student_id} className="grid gap-2 rounded-xl border border-[#E3DED3] p-4 break-inside-avoid">
            <p className="flex flex-wrap items-center gap-2"><span className="font-bold">{row.name}</span>{row.age != null ? <span className="text-sm text-admin-muted">{row.age} år</span> : null}<StatusPill tone={row.going ? "ok" : "neutral"}>{row.going ? "Deltar" : row.consent === "declined" ? "Ikke samtykke" : "Deltar ikke"}</StatusPill></p>
            {row.classes ? <p className="text-sm text-admin-muted">{row.classes}</p> : null}
            {row.going ? <>
              {guardians.length ? <p className="text-sm">Foresatte: {guardians.map((person) => [person.name, person.phone].filter(Boolean).join(" ")).join(", ")}</p> : null}
              {pickup.length ? <p className="text-sm">Henting: {pickup.map((person) => [person.name, person.phone].filter(Boolean).join(" ")).join(", ")}</p> : null}
              {row.photo_consent === false ? <p className="text-sm font-semibold">Ikke foto</p> : null}
              {activity.price_ore != null ? <p className="text-sm">{row.paid_ore >= activity.price_ore ? "Betalt" : `Betalt ${formatNok(row.paid_ore)} av ${formatNok(activity.price_ore)}`}</p> : null}
              {activity.status === "published" && activity.event_date <= today ? <ParticipationButtons activityId={activity.id} studentId={row.student_id} participation={row.participation} locale="no" /> : null}
            </> : null}
          </li>;
        })}</ul>
      </>}
    </section> : null}

    {showPayments ? <section aria-labelledby="sfo-payments" className={`${card} grid gap-4 print:hidden`}>
      <h2 id="sfo-payments" className="font-heading text-xl font-bold">Betaling</h2>
      {payments.error ? <p role="status">Kunne ikke hente betalinger</p> : <>
        <p className="font-semibold">Betalt: {formatNok((payments.data ?? []).reduce((sum, row) => sum + row.paid_ore, 0))} · Mangler: {unpaid.length}</p>
        <ul className="divide-y divide-[#ECE8DF]">{(payments.data ?? []).map((row) => <li key={row.student_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <span className="font-semibold">{row.name}</span>
          <span className="flex flex-wrap items-center gap-2 text-sm">{formatNok(row.paid_ore)}{row.methods ? <span className="text-admin-muted">{row.methods}</span> : null}
            <StatusPill tone={row.paid_ore >= (activity.price_ore ?? 0) ? "ok" : row.going ? "pending" : "neutral"}>{row.paid_ore >= (activity.price_ore ?? 0) ? "Betalt" : row.going ? "Mangler" : "Deltar ikke"}</StatusPill></span>
        </li>)}</ul>
        {activity.status === "published" && unpaid.length ? <SfoCashForm activityId={activity.id} students={unpaid.map((row) => ({ id: row.student_id, name: row.name }))}
          defaultKroner={String(((activity.price_ore ?? 0) - (unpaid[0]?.paid_ore ?? 0)) / 100)} today={today} /> : null}
      </>}
    </section> : null}

    {showRefunds ? <section aria-labelledby="sfo-refunds" className={`${card} grid gap-4 print:hidden`}>
      <h2 id="sfo-refunds" className="font-heading text-xl font-bold">Tilbakebetaling</h2>
      {refunds.error ? <p role="status">Kunne ikke hente tilbakebetalinger</p> : !refunds.data?.length ? <p className="text-sm text-admin-muted">Ingen</p>
        : <ul className="divide-y divide-[#ECE8DF]">{refunds.data.map((row) => <li key={row.student_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <span className="font-semibold">{row.name}</span><span className="text-sm">Betalt {formatNok(row.paid_ore)} · Tilbake {formatNok(row.refund_ore)}</span>
        </li>)}</ul>}
    </section> : null}
  </div>;
}
