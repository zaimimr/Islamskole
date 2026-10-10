"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { copyTeachingYear } from "@/lib/portal/week-plan-actions";

export function ReuseTeachingPlan({ classId, schoolYearId, years }: {
  classId: string; schoolYearId: string; years: { id: string; label: string }[];
}) {
  const locale = useLocale();
  const t = useTranslations("portal.errors");
  const [sourceYearId, setSourceYearId] = useState(years[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  if (!years.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SelectField aria-label={locale === "en" ? "Previous school year" : "Tidligere skoleår"}
        value={sourceYearId} onValueChange={setSourceYearId} disabled={pending}
        options={years.map((year) => ({ value: year.id, label: year.label }))} triggerClassName="min-h-11" />
      <Button variant="outline" disabled={pending} className="min-h-11" onClick={() => startTransition(async () => {
        const result = await copyTeachingYear({ classId, schoolYearId, sourceYearId });
        if (result.ok) toast.success(locale === "en" ? `${result.count} topics copied` : `${result.count} temaer kopiert`);
        else toast.error(t(result.error));
      })}>
        {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Copy aria-hidden="true" className="size-4" />}
        {locale === "en" ? "Reuse teaching plan" : "Gjenbruk undervisningsplan"}
      </Button>
    </div>
  );
}
