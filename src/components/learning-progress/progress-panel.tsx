"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadLearningGoals } from "@/lib/learning-progress/actions";
import type { LearningGoal, LearningPage } from "@/lib/learning-progress/types";
import { ProgressForm } from "./progress-form";
import { ProgressDetails, ProgressStatus, progressDate } from "./progress-details";
import { ProgressHistory } from "./progress-history";

export function ProgressPanel({ studentId, classId, initial }: {
  studentId: string; classId?: string | null; initial: LearningPage<LearningGoal>;
}) {
  const t = useTranslations("learningProgress");
  const locale = useLocale();
  const prefix = useId();
  const restoreFocus = useRef<string | null>(null);
  const [source, setSource] = useState(initial);
  const [rows, setRows] = useState(initial.rows);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [editor, setEditor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  if (source !== initial) {
    setSource(initial);
    setRows(initial.rows);
    setHasMore(initial.hasMore);
    setEditor(null);
  }

  useEffect(() => {
    if (editor === null && restoreFocus.current) {
      document.getElementById(restoreFocus.current)?.focus();
      restoreFocus.current = null;
    }
  }, [editor]);

  function edit(id: string) {
    restoreFocus.current = `${prefix}-${id}`;
    setEditor(id);
  }

  function loadMore() {
    setError(false);
    startTransition(async () => {
      try {
        const result = await loadLearningGoals(studentId, rows.length);
        if (!result.ok) { setError(true); return; }
        setRows((previous) => [...previous, ...result.data.rows]);
        setHasMore(result.data.hasMore);
      } catch { setError(true); }
    });
  }

  return (
    <div className="grid max-w-3xl gap-5">
      {classId !== undefined ? editor === "new" ? <ProgressForm studentId={studentId} classId={classId} onClose={() => setEditor(null)} /> : <Button id={`${prefix}-new`} onClick={() => edit("new")} disabled={editor !== null} className="min-h-11 w-fit rounded-xl bg-admin-action text-white hover:bg-brand-green-dark"><Plus aria-hidden="true" />{t("newGoal")}</Button> : null}
      {!rows.length && editor !== "new" ? <p className="text-muted-foreground">{t(classId !== undefined ? "emptyTeacher" : "emptyFamily")}</p> : null}
      <div className="grid divide-y divide-foreground/10">
        {rows.map((goal) => (
          <article key={goal.id} aria-labelledby={`learning-goal-${goal.id}`} className="grid gap-4 py-5 first:pt-0">
            <header className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold text-muted-foreground">{t(`subjects.${goal.subject}`)}</span><ProgressStatus status={goal.status} /></div>
              <h3 id={`learning-goal-${goal.id}`} className="font-heading text-xl font-semibold wrap-anywhere">{goal.title}</h3>
              {goal.surah ? <p className="text-sm wrap-anywhere">{t("surah")} {goal.surah}{goal.ayah_from !== null ? ` · ${t("ayahRange", { from: goal.ayah_from, to: goal.ayah_to ?? goal.ayah_from })}` : ""}</p> : null}
            </header>
            <ProgressDetails feedback={goal.feedback} nextTarget={goal.next_target} />
            <p className="text-sm text-muted-foreground wrap-anywhere"><time dateTime={goal.updated_at}>{progressDate(goal.updated_at, locale)}</time> · {goal.updated_by_name}</p>
            {classId !== undefined && editor === goal.id ? <ProgressForm studentId={studentId} classId={classId} goal={goal} onClose={() => setEditor(null)} /> : classId !== undefined ? <Button id={`${prefix}-${goal.id}`} variant="outline" disabled={editor !== null} onClick={() => edit(goal.id)} className="min-h-11 w-fit rounded-xl">{t("recordUpdate")}</Button> : null}
            <ProgressHistory key={goal.latest_update_id} goalId={goal.id} />
          </article>
        ))}
      </div>
      {error ? <p role="alert" className="text-sm font-semibold text-destructive">{t("errors.unavailable")}</p> : null}
      {hasMore || error ? <Button variant="outline" disabled={pending} onClick={loadMore} className="min-h-11 w-fit rounded-xl">{t(pending ? "loading" : error ? "retry" : "moreGoals")}</Button> : null}
    </div>
  );
}
