import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Check, CircleAlert, Clock, Mail } from "lucide-react";
import { AcknowledgeButton, DeliveryActions } from "@/components/announcements/announcement-actions";
import { getAnnouncement } from "@/lib/announcements/data";
import { createClient } from "@/lib/supabase/server";

export async function AnnouncementDetail({ id, locale, baseHref }: { id: string; locale: string; baseHref: string }) {
  const [t, result] = await Promise.all([getTranslations({ locale, namespace: "announcements" }), getAnnouncement(id)]);
  if (!result) notFound();
  const { announcement, canManage, families } = result;
  const client = await createClient();
  const { data: myFamilyIds, error } = await client.rpc("portal_my_family_ids");
  if (error) throw new Error("Could not load announcement family access", { cause: error });
  const mine = announcement.announcement_families.filter((family) => myFamilyIds?.includes(family.family_id));
  const confirmed = families.filter((family) => family.acknowledged_at).length;
  const audience = announcement.class_id ? (locale === "en" ? announcement.class_name_en : announcement.class_name_no) : t("wholeSchool");
  const date = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "nb-NO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" }).format(new Date(announcement.published_at));

  return (
    <div className="grid gap-6">
      <Link href={baseHref} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"><ArrowLeft aria-hidden="true" className="size-4" />{t("allAnnouncements")}</Link>
      <article className="rounded-xl border border-foreground/10 bg-card p-5 sm:p-8">
        <header className="grid gap-3">
          <h1 className="max-w-prose font-heading text-3xl font-bold text-balance wrap-anywhere">{announcement.title}</h1>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground"><span>{audience}</span><time dateTime={announcement.published_at}>{t("sentLabel", { date })}</time></p>
        </header>
        <p className="mt-6 max-w-prose whitespace-pre-wrap leading-relaxed wrap-anywhere">{announcement.body}</p>
        {announcement.requires_acknowledgement && mine.length ? <ul className="mt-6 grid gap-4 border-t border-foreground/10 pt-5">
          {mine.map((family) => <li key={family.family_id} className="grid gap-2">
            {mine.length > 1 ? <p className="font-semibold">{family.family_name}</p> : null}
            <AcknowledgeButton id={id} familyId={family.family_id} confirmed={Boolean(family.acknowledged_at)} />
          </li>)}
        </ul> : null}
      </article>
      {canManage ? (
        <section aria-labelledby="announcement-recipients-title" className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 id="announcement-recipients-title" className="font-heading text-2xl font-semibold">{t("recipients")}</h2><p className="mt-1 text-sm text-muted-foreground">{announcement.requires_acknowledgement ? t("ackCount", { confirmed, total: families.length }) : t("families", { count: families.length })}</p></div>
            {announcement.email_enabled ? <DeliveryActions id={id} hasFailed={families.some((family) => family.email_status === "failed")} hasPending={families.some((family) => family.email_status === "pending")} /> : null}
          </div>
          <ul className="divide-y divide-foreground/10 rounded-xl border border-foreground/10 bg-card">
            {families.map((family) => {
              const failed = family.email_status === "failed" || family.email_status === "missing_email";
              const Icon = failed ? CircleAlert : family.email_status === "pending" ? Clock : Mail;
              return <li key={family.family_id} className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-6">
                <p className="font-semibold wrap-anywhere">{family.family_name}</p>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  <span className={`inline-flex items-center gap-2 ${failed ? "font-semibold text-destructive" : "text-muted-foreground"}`}><Icon aria-hidden="true" className="size-4" />{t(`status.${family.email_status}`)}</span>
                  {announcement.requires_acknowledgement ? <span className={`inline-flex items-center gap-2 ${family.acknowledged_at ? "text-brand-green-dark" : "text-muted-foreground"}`}>{family.acknowledged_at ? <Check aria-hidden="true" className="size-4" /> : <Clock aria-hidden="true" className="size-4" />}{t(family.acknowledged_at ? "acknowledged" : "awaitingAck")}</span> : null}
                </div>
              </li>;
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
