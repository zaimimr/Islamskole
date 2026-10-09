"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function AnnouncementLoadError({ reset }: { reset: () => void }) {
  const t = useTranslations("announcements");
  return <div role="alert" className="grid gap-4 rounded-xl border border-foreground/10 bg-card p-6">
    <p>{t("errors.unavailable")}</p>
    <Button onClick={reset} className="min-h-11 w-fit rounded-xl bg-admin-action text-white hover:bg-brand-green-dark">{t("refresh")}</Button>
  </div>;
}
