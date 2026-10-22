import Link from "next/link";
import { notFound } from "next/navigation";
import { adminBasePath } from "@/components/admin/paths";
import { EmailQueueButton } from "@/components/announcements/email-queue-buttons";
import { EmailSendLog } from "@/components/admin/email-send-log";
import { SectionNavigation } from "@/components/admin/section-navigation";
import { getIsAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const KINDS = {
  no: { signup_parent: "Påmelding, foresatt", signup_student: "Påmelding, elev", welcome_parent: "Min side, foresatt", welcome_student: "Min side, elev", plan_confirmed: "Betalingsplan", payment_reminder: "Betalingspåminnelse", installment_due: "Neste avdrag", installment_reminder: "Påminnelse om avdrag", report_published: "Semesterrapport", attendance_followup: "Fraværsoppfølging", activity_consent: "Aktivitetssamtykke", activity_cancelled: "Aktivitet avlyst", activity_added: "Ny aktivitetsinvitasjon" },
  en: { signup_parent: "Application, parent", signup_student: "Application, student", welcome_parent: "Min side, parent", welcome_student: "Min side, student", plan_confirmed: "Installment plan", payment_reminder: "Payment reminder", installment_due: "Next installment", installment_reminder: "Installment reminder", report_published: "End-of-term report", attendance_followup: "Attendance follow-up", activity_consent: "Activity consent", activity_cancelled: "Activity cancelled", activity_added: "Additional activity invitation" },
};
const STATUSES = {
  no: { pending: "Venter", sending: "Sender", sent: "Sendt", failed: "Feilet", skipped: "Ikke aktuelt" },
  en: { pending: "Pending", sending: "Sending", sent: "Sent", failed: "Failed", skipped: "No longer applicable" },
};

export default async function SchoolEmailPage({ params, searchParams }: PageProps<"/[locale]/admin/beskjeder/epost">) {
  if (!(await getIsAdmin())) notFound();
  const { locale } = await params;
  const language = locale === "en" ? "en" : "no";
  const en = language === "en";
  const query = await searchParams;
  const queue = query.fane === "ko";
  const requestedPage = Number(query.side);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1;
  const href = `${adminBasePath(locale)}/beskjeder/epost`;
  const { data, error } = queue ? await (await createClient()).from("school_email_deliveries")
    .select("id, kind, email, status, created_at").order("status").order("created_at", { ascending: false }).limit(100)
    : { data: null, error: null };
  return <div className="grid gap-6">
    <Link href={`${adminBasePath(locale)}/beskjeder`} className="inline-flex min-h-11 items-center font-semibold text-admin-action">{en ? "Announcements" : "Beskjeder"}</Link>
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="font-heading text-3xl font-semibold">{en ? "Email delivery" : "E-postutsending"}</h1>
      {queue ? <EmailQueueButton locale={locale} /> : null}
    </header>
    <SectionNavigation label={en ? "Email views" : "E-postvisning"} current={queue ? "ko" : "logg"} items={[
      { id: "logg", label: en ? "Send log" : "Sendelog", href },
      { id: "ko", label: en ? "Queue and failures" : "Kø og feil", href: `${href}?fane=ko` },
    ]} />
    {!queue ? <EmailSendLog locale={locale} page={page} href={href} /> : error ? <p role="alert">{en ? "Could not load email delivery. Reload the page." : "Kunne ikke laste e-postutsending. Last siden på nytt."}</p> :
      data?.length ? <ul className="divide-y divide-foreground/10 rounded-2xl bg-white px-5">
        {data.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="grid min-w-0 gap-1">
            <p className="break-all font-semibold">{row.email}</p>
            <p className="text-sm text-admin-muted">{KINDS[language][row.kind as keyof typeof KINDS.no]} · {STATUSES[language][row.status as keyof typeof STATUSES.no]}</p>
            <time className="text-sm text-admin-muted" dateTime={row.created_at}>{new Intl.DateTimeFormat(en ? "en-GB" : "nb-NO", { timeZone: "Europe/Oslo", dateStyle: "medium", timeStyle: "short" }).format(new Date(row.created_at))}</time>
          </div>
          {row.status === "failed" ? <EmailQueueButton locale={locale} id={row.id} /> : null}
        </li>)}
      </ul> : <p>{en ? "No email deliveries yet." : "Ingen e-postutsendinger ennå."}</p>}
  </div>;
}
