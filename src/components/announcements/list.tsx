import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRight, CircleCheck } from "lucide-react";
import { AnnouncementComposer } from "@/components/announcements/composer";
import { getAnnouncements, getAnnouncementWorkspace } from "@/lib/announcements/data";

export async function AnnouncementList({ locale, baseHref, page }: { locale: string; baseHref: string; page: number }) {
  const [t, workspace, announcements] = await Promise.all([
    getTranslations({ locale, namespace: "announcements" }),
    getAnnouncementWorkspace(locale), getAnnouncements(page),
  ]);
  const dateFormat = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "nb-NO", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Oslo" });
  return (
    <div className="grid gap-6">
      <h1 className="font-heading text-3xl font-bold text-balance sm:text-4xl">{t("title")}</h1>
      {workspace.canPublish ? <AnnouncementComposer {...workspace} baseHref={baseHref} /> : null}
      {announcements.rows.length ? (
        <ul className="divide-y divide-foreground/10 rounded-xl border border-foreground/10 bg-card">
          {announcements.rows.map((row) => {
            const pendingAck = row.requires_acknowledgement && row.announcement_families.some((family) => !family.acknowledged_at);
            const audience = row.class_id ? (locale === "en" ? row.class_name_en : row.class_name_no) : t("wholeSchool");
            return (
              <li key={row.id}>
                <Link href={`${baseHref}/${row.id}`} className="group grid gap-2 rounded-xl p-5 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-6">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                    <span>{audience}</span><time dateTime={row.published_at}>{dateFormat.format(new Date(row.published_at))}</time>
                    {row.requires_acknowledgement ? <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${pendingAck ? "bg-brand-sun/25 text-foreground" : "bg-primary/12 text-brand-green-dark"}`}><CircleCheck aria-hidden="true" className="size-3.5" />{t(pendingAck ? "ackNeeded" : "acknowledged")}</span> : null}
                  </div>
                  <div className="flex items-start justify-between gap-4"><h2 className="font-heading text-xl font-semibold wrap-anywhere">{row.title}</h2><ChevronRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" /></div>
                  <p className="line-clamp-2 max-w-prose text-sm text-foreground/80 wrap-anywhere">{row.body}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : <p className="rounded-xl border border-foreground/10 bg-card p-6 text-muted-foreground">{t("empty")}</p>}
      {page > 1 || announcements.hasNext ? <nav aria-label={t("title")} className="flex flex-wrap items-center gap-4 text-sm">
        {page > 1 ? <Link className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50" href={`${baseHref}?side=${page - 1}`}>{t("previous")}</Link> : null}
        <span>{t("page", { page })}</span>
        {announcements.hasNext ? <Link className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50" href={`${baseHref}?side=${page + 1}`}>{t("next")}</Link> : null}
      </nav> : null}
    </div>
  );
}
