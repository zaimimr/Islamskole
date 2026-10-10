"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function ProgressLoadError() {
  const t = useTranslations("learningProgress");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <div className="grid gap-3"><p role="alert" className="text-sm font-semibold text-destructive">{t("errors.unavailable")}</p><Button variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())} className="min-h-11 w-fit rounded-xl">{t(pending ? "loading" : "retry")}</Button></div>;
}
