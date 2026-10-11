import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export async function EmailSendLog({ locale, page, href }: { locale: string; page: number; href: string }) {
  const en = locale === "en";
  const pageSize = 50;
  const { data, error } = await (await createClient()).from("email_send_logs")
    .select("id, recipients, subject, status, created_at, completed_at, transport")
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize);
  const statuses = en ? { sending: "Started", sent: "Sent", failed: "Failed", disabled: "Sending disabled" }
    : { sending: "Påbegynt", sent: "Sendt", failed: "Feilet", disabled: "Utsending deaktivert" };
  if (error) return <p role="alert">{en ? "Could not load email log. Reload the page." : "Kunne ikke laste sendeloggen. Last siden på nytt."}</p>;
  const rows = data.slice(0, pageSize);
  return <section aria-label={en ? "Email send log" : "Sendelog"} className="grid gap-4">
    {rows.length ? <ul className="divide-y divide-foreground/10 rounded-2xl bg-white px-4 sm:px-5">
      {rows.map((row) => <li key={row.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid min-w-0 gap-1">
          <p className="wrap-anywhere font-semibold">{row.subject}</p>
          <p className="wrap-anywhere text-sm text-admin-muted">{row.recipients.join(", ")}</p>
          <time className="text-sm text-admin-muted" dateTime={row.completed_at ?? row.created_at}>{new Intl.DateTimeFormat(en ? "en-GB" : "nb-NO", {
            timeZone: "Europe/Oslo", dateStyle: "medium", timeStyle: "short",
          }).format(new Date(row.completed_at ?? row.created_at))}</time>
        </div>
        <p className="text-sm font-semibold">{statuses[row.status as keyof typeof statuses]}{row.transport === "outbox" ? (en ? " · Test outbox" : " · Testutsending") : ""}</p>
      </li>)}
    </ul> : <p>{en ? "No emails on this page." : "Ingen e-poster på denne siden."}</p>}
    <nav aria-label={en ? "Email log pages" : "Sider i sendeloggen"} className="flex flex-wrap gap-4">
      {page > 1 ? <Link href={`${href}?side=${page - 1}`} className="inline-flex min-h-11 items-center font-semibold text-admin-action">{en ? "Newer" : "Nyere"}</Link> : null}
      {data.length > pageSize ? <Link href={`${href}?side=${page + 1}`} className="inline-flex min-h-11 items-center font-semibold text-admin-action">{en ? "Older" : "Eldre"}</Link> : null}
    </nav>
  </section>;
}
