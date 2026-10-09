"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acknowledgeAnnouncement, retryAnnouncementEmails } from "@/lib/announcements/actions";
import type { AnnouncementError } from "@/lib/announcements/schema";

export function AcknowledgeButton({ id, familyId, confirmed }: { id: string; familyId: string; confirmed: boolean }) {
  const t = useTranslations("announcements");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<AnnouncementError | null>(null);
  const [saved, setSaved] = useState(confirmed);
  if (confirmed || saved) return <span className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-green-dark"><Check aria-hidden="true" className="size-4" />{t("acknowledged")}</span>;
  return (
    <div className="grid gap-2">
      <Button disabled={pending} className="min-h-11 w-fit max-w-full rounded-xl bg-admin-action text-white whitespace-normal hover:bg-brand-green-dark" onClick={() => {
        setError(null);
        startTransition(async () => {
          try {
            const result = await acknowledgeAnnouncement(id, familyId);
            if (!result.ok) { setError(result.error); return; }
            setSaved(true);
            toast.success(t("ackSaved"));
            router.refresh();
          } catch { setError("unavailable"); }
        });
      }}>{pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}{t("acknowledge")}</Button>
      {error ? <p role="alert" className="text-sm text-destructive">{t(`errors.${error}`)}</p> : null}
    </div>
  );
}

export function DeliveryActions({ id, hasFailed, hasPending }: { id: string; hasFailed: boolean; hasPending: boolean }) {
  const t = useTranslations("announcements");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<AnnouncementError | null>(null);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {hasFailed || hasPending ? <Button disabled={pending} variant="outline" className="min-h-11 rounded-xl" onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const result = await retryAnnouncementEmails(id);
              if (!result.ok) { setError(result.error); return; }
              toast.success(t("retryStarted"));
              router.refresh();
            } catch { setError("unavailable"); }
          });
        }}>{pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}{t(hasFailed ? "retry" : "sendPending")}</Button> : null}
        <Button variant="ghost" className="min-h-11" onClick={() => router.refresh()}><RefreshCw aria-hidden="true" className="size-4" />{t("refresh")}</Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{t(`errors.${error}`)}</p> : null}
    </div>
  );
}
