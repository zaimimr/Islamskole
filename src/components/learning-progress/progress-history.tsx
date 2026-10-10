"use client";

import { useId, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadLearningHistory } from "@/lib/learning-progress/actions";
import type { LearningUpdate } from "@/lib/learning-progress/types";
import { ProgressDetails, ProgressStatus, progressDate } from "./progress-details";

export function ProgressHistory({ goalId }: { goalId: string }) {
  const t = useTranslations("learningProgress");
  const locale = useLocale();
  const regionId = useId();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LearningUpdate[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function load() {
    setError(false);
    startTransition(async () => {
      try {
        const result = await loadLearningHistory(goalId, rows?.length ?? 0);
        if (!result.ok) { setError(true); return; }
        setRows((previous) => [...(previous ?? []), ...result.data.rows]);
        setHasMore(result.data.hasMore);
      } catch { setError(true); }
    });
  }

  return (
    <div className="grid gap-3">
      <Button variant="ghost" aria-expanded={open} aria-controls={regionId} disabled={pending} onClick={() => { setOpen(!open); if (!open && rows === null) load(); }} className="min-h-11 w-fit justify-start rounded-lg px-2">
        <ChevronDown aria-hidden="true" className={open ? "rotate-180" : ""} />{t("history")}
      </Button>
      {open ? (
        <div id={regionId} aria-busy={pending} className="grid gap-3">
          {rows?.length ? <ol className="grid divide-y divide-foreground/10 border-y border-foreground/10">{rows.map((row) => (
            <li key={row.id} className="grid gap-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><ProgressStatus status={row.status} /><time dateTime={row.created_at} className="text-sm text-muted-foreground">{progressDate(row.created_at, locale)}</time></div>
              <p className="text-sm font-semibold">{row.teacher_name}</p>
              <ProgressDetails feedback={row.feedback} nextTarget={row.next_target} />
            </li>
          ))}</ol> : null}
          {pending ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 aria-hidden="true" className="size-4 animate-spin" />{t("loading")}</p> : null}
          {error ? <p role="alert" className="text-sm font-semibold text-destructive">{t("errors.unavailable")}</p> : null}
          {hasMore || error ? <Button variant="outline" disabled={pending} onClick={load} className="min-h-11 w-fit rounded-xl">{t(error ? "retry" : "moreHistory")}</Button> : null}
        </div>
      ) : null}
    </div>
  );
}
