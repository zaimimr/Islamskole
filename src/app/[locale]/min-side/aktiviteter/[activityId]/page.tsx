import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import { formatSchoolDay } from "@/lib/portal/teacher-days";
import { ActivityRoster } from "@/components/school-activities/activity-roster";
import { PrintRoster } from "@/components/school-activities/print-roster";

export default async function ActivityRosterPage({ params }: PageProps<"/[locale]/min-side/aktiviteter/[activityId]">) {
  const { locale, activityId } = await params;
  setRequestLocale(locale);
  if (!(await getUser())) redirect({ href: "/min-side/logg-inn", locale });
  const client = await createClient();
  const { data: allowed, error: accessError } = await client.rpc("activity_can_staff", { p_id: activityId });
  if (accessError) throw new Error("Activity access unavailable");
  if (!allowed) notFound();
  const { data, error } = await client.from("school_activities").select("title, description, consent_text, event_date, respond_by, status").eq("id", activityId).maybeSingle();
  if (error) throw new Error("Activity unavailable");
  if (!data) notFound();
  return <article className="report-print grid gap-6"><header className="grid gap-3"><h1 className="font-heading text-3xl font-semibold wrap-anywhere">{data.title}</h1><p>{formatSchoolDay(data.event_date, locale)} · {locale === "en" ? "Response deadline" : "Svarfrist"}: {formatSchoolDay(data.respond_by, locale)}</p>{data.status === "cancelled" ? <p className="font-semibold">{locale === "en" ? "Cancelled" : "Avlyst"}</p> : null}<p className="whitespace-pre-line wrap-anywhere">{data.description}</p><p className="whitespace-pre-line wrap-anywhere">{data.consent_text}</p><PrintRoster locale={locale} /></header><ActivityRoster activityId={activityId} eventDate={data.event_date} status={data.status} locale={locale} /></article>;
}
