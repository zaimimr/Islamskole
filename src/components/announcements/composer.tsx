"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { previewAnnouncementAudience, publishAnnouncement } from "@/lib/announcements/actions";
import { announcementSchema, type AnnouncementDraft, type AnnouncementError, type Audience } from "@/lib/announcements/schema";

export function AnnouncementComposer({
  classes, isAdmin, emailAvailable, baseHref,
}: {
  classes: { id: string; name: string }[];
  isAdmin: boolean;
  emailAvailable: boolean;
  baseHref: string;
}) {
  const t = useTranslations("announcements");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<AnnouncementError | null>(null);
  const [review, setReview] = useState<{ draft: AnnouncementDraft; audience: Audience } | null>(null);
  const [classId, setClassId] = useState(isAdmin ? "school" : classes[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(emailAvailable);
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(false);
  const options = [
    ...(isAdmin ? [{ value: "school", label: t("wholeSchool") }] : []),
    ...classes.map((row) => ({ value: row.id, label: row.name })),
  ];

  function preview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = announcementSchema.safeParse({
      id: crypto.randomUUID(), classId: classId === "school" ? null : classId,
      title, body, emailEnabled, requiresAcknowledgement,
    });
    if (!parsed.success) { setError("invalid"); return; }
    startTransition(async () => {
      try {
        const result = await previewAnnouncementAudience(parsed.data.classId);
        if (!result.ok) { setError(result.error); return; }
        setReview({ draft: parsed.data, audience: result.data });
      } catch { setError("unavailable"); }
    });
  }

  function publish() {
    if (!review) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await publishAnnouncement(review.draft);
        if (!result.ok) { setError(result.error); return; }
        toast.success(t("published"));
        router.push(`${baseHref}/${result.data}`);
        router.refresh();
      } catch { setError("unavailable"); }
    });
  }

  if (!open) return (
    <Button onClick={() => setOpen(true)} className="min-h-11 w-fit rounded-xl bg-admin-action text-white hover:bg-brand-green-dark">
      <Plus aria-hidden="true" />{t("new")}
    </Button>
  );

  return (
    <section aria-labelledby="announcement-composer-title" className="rounded-xl border border-foreground/10 bg-card p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id="announcement-composer-title" className="font-heading text-2xl font-semibold">{t(review ? "previewTitle" : "new")}</h2>
        <Button variant="ghost" disabled={pending} onClick={() => { setOpen(false); setReview(null); setError(null); }} className="min-h-11">{t("closeComposer")}</Button>
      </div>
      {review ? (
        <div className="grid gap-5">
          <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <div><dt className="text-muted-foreground">{t("audience")}</dt><dd className="font-semibold">{options.find((row) => row.value === classId)?.label}</dd></div>
            <div><dt className="text-muted-foreground">{t("recipients")}</dt><dd className="font-semibold">{t("families", { count: review.audience.family_count })}{emailEnabled ? ` · ${t("emails", { count: review.audience.email_count })}` : ""}</dd></div>
          </dl>
          <div className="border-y border-foreground/10 py-5">
            <h3 className="font-heading text-xl font-semibold wrap-anywhere">{review.draft.title}</h3>
            <p className="mt-3 max-w-prose whitespace-pre-wrap wrap-anywhere">{review.draft.body}</p>
          </div>
          {requiresAcknowledgement ? <p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 aria-hidden="true" className="size-4" />{t("ackRequired")}</p> : null}
          {emailEnabled && review.audience.missing_email_count > 0 ? <p role="status" className="rounded-lg bg-secondary p-3 text-sm">{t("missingEmail", { count: review.audience.missing_email_count })}</p> : null}
          <div className="flex flex-wrap gap-3">
            <Button disabled={pending} onClick={publish} className="min-h-11 rounded-xl bg-admin-action text-white hover:bg-brand-green-dark">{pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Send aria-hidden="true" />}{t(pending ? "publishing" : emailEnabled ? "publish" : "publishPortal")}</Button>
            <Button disabled={pending} variant="outline" onClick={() => { setReview(null); setError(null); }} className="min-h-11 rounded-xl">{t("back")}</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={preview} className="grid max-w-2xl gap-5" aria-busy={pending}>
          <fieldset disabled={pending} className="grid gap-5">
            <div className="grid gap-2"><Label htmlFor="announcement-audience">{t("audience")}</Label><SelectField id="announcement-audience" value={classId} onValueChange={setClassId} options={options} triggerClassName="min-h-11" /></div>
            <div className="grid gap-2"><Label htmlFor="announcement-title">{t("subject")}</Label><Input id="announcement-title" required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-11" /></div>
            <div className="grid gap-2"><Label htmlFor="announcement-body">{t("body")}</Label><Textarea id="announcement-body" required maxLength={5000} rows={7} value={body} onChange={(event) => setBody(event.target.value)} /></div>
            <div className="grid gap-1">
              <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={emailEnabled} disabled={!emailAvailable} onChange={(event) => setEmailEnabled(event.target.checked)} className="size-5 accent-[var(--brand-green-dark)]" />{t("email")}</label>
              {!emailAvailable ? <p className="text-sm text-muted-foreground">{t("emailUnavailable")}</p> : null}
              <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={requiresAcknowledgement} onChange={(event) => setRequiresAcknowledgement(event.target.checked)} className="size-5 accent-[var(--brand-green-dark)]" />{t("ackRequired")}</label>
            </div>
          </fieldset>
          <Button type="submit" disabled={pending} className="min-h-11 w-fit rounded-xl bg-admin-action text-white hover:bg-brand-green-dark">{pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}{t("review")}</Button>
        </form>
      )}
      {error ? <p role="alert" className="mt-4 text-sm font-semibold text-destructive">{t(`errors.${error}`)}</p> : null}
    </section>
  );
}
