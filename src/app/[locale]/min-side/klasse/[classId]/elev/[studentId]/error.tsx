"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function ProgressError({ reset }: { reset: () => void }) {
  const t = useTranslations("learningProgress");
  return <div className="grid gap-4"><p role="alert" className="text-destructive">{t("errors.unavailable")}</p><Button onClick={reset} className="min-h-11 w-fit bg-admin-action text-white hover:bg-brand-green-dark">{t("retry")}</Button></div>;
}
