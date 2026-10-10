"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { createLearningGoal, recordLearningProgress } from "@/lib/learning-progress/actions";
import { LEARNING_STATUSES, LEARNING_SUBJECTS, learningGoalSchema, progressUpdateSchema } from "@/lib/learning-progress/schema";
import type { LearningError } from "@/lib/learning-progress/schema";
import type { LearningGoal } from "@/lib/learning-progress/types";

export function ProgressForm({ studentId, classId, goal, onClose }: {
  studentId: string; classId: string | null; goal?: LearningGoal; onClose: () => void;
}) {
  const t = useTranslations("learningProgress");
  const router = useRouter();
  const prefix = useId();
  const [requestId] = useState(() => crypto.randomUUID());
  const [subject, setSubject] = useState("quran");
  const [status, setStatus] = useState(goal?.status ?? "practising");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<LearningError | null>(null);

  useEffect(() => {
    if (goal) document.getElementById(`${prefix}-status`)?.focus();
  }, [goal, prefix]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");
    const number = (name: string) => text(name).trim() ? Number(text(name)) : null;
    const progress = { id: requestId, status, feedback: text("feedback"), nextTarget: text("nextTarget") };
    const parsed = goal
      ? progressUpdateSchema.safeParse({ ...progress, goalId: goal.id, expectedUpdateId: goal.latest_update_id })
      : learningGoalSchema.safeParse({ ...progress, studentId, classId, subject, title: text("title"),
          surah: subject === "quran" ? text("surah") : null,
          ayahFrom: subject === "quran" ? number("ayahFrom") : null,
          ayahTo: subject === "quran" ? number("ayahTo") : null });
    if (!parsed.success) {
      setError(parsed.error.issues.some((issue) => issue.message === "invalid_reference") ? "invalid_reference" : "invalid");
      return;
    }
    startTransition(async () => {
      try {
        const result = goal
          ? await recordLearningProgress(progressUpdateSchema.parse(parsed.data))
          : await createLearningGoal(learningGoalSchema.parse(parsed.data));
        if (!result.ok) { setError(result.error); return; }
        toast.success(t("saved"));
        onClose();
        router.refresh();
      } catch { setError("unavailable"); }
    });
  }

  return (
    <form onSubmit={submit} onChange={() => setError((current) => current === "conflict" ? current : null)} aria-busy={pending} className="grid max-w-2xl gap-5 rounded-xl border border-foreground/10 bg-card p-5 sm:p-6">
      <h3 className="font-heading text-xl font-semibold">{t(goal ? "recordUpdate" : "newGoal")}</h3>
      <fieldset disabled={pending} className="grid min-w-0 gap-5">
        {!goal ? (
          <>
            <div className="grid gap-2"><Label htmlFor={`${prefix}-subject`}>{t("subject")}</Label><SelectField id={`${prefix}-subject`} value={subject} onValueChange={setSubject} options={LEARNING_SUBJECTS.map((value) => ({ value, label: t(`subjects.${value}`) }))} triggerClassName="min-h-11" /></div>
            <div className="grid gap-2"><Label htmlFor={`${prefix}-title`}>{t("goal")}</Label><Input id={`${prefix}-title`} name="title" required maxLength={200} autoFocus className="min-h-11" /></div>
            {subject === "quran" ? (
              <fieldset className="grid gap-3">
                <legend className="mb-2 text-sm font-semibold">{t("referenceOptional")}</legend>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="grid gap-2"><Label htmlFor={`${prefix}-surah`}>{t("surah")}</Label><Input id={`${prefix}-surah`} name="surah" maxLength={120} className="min-h-11" /></div>
                  <div className="grid gap-2"><Label htmlFor={`${prefix}-from`}>{t("ayahFrom")}</Label><Input id={`${prefix}-from`} name="ayahFrom" type="number" min={1} max={2147483647} step={1} className="min-h-11" /></div>
                  <div className="grid gap-2"><Label htmlFor={`${prefix}-to`}>{t("ayahTo")}</Label><Input id={`${prefix}-to`} name="ayahTo" type="number" min={1} max={2147483647} step={1} className="min-h-11" /></div>
                </div>
              </fieldset>
            ) : null}
          </>
        ) : null}
        <div className="grid gap-2"><Label htmlFor={`${prefix}-status`}>{t("status")}</Label><SelectField id={`${prefix}-status`} value={status} onValueChange={setStatus} options={LEARNING_STATUSES.map((value) => ({ value, label: t(`statuses.${value}`) }))} triggerClassName="min-h-11" /></div>
        <div className="grid gap-2"><Label htmlFor={`${prefix}-feedback`}>{t("feedback")}</Label><Textarea id={`${prefix}-feedback`} name="feedback" maxLength={2000} rows={3} /></div>
        <div className="grid gap-2"><Label htmlFor={`${prefix}-target`}>{t("nextTarget")}</Label><Textarea id={`${prefix}-target`} name="nextTarget" defaultValue={goal?.next_target ?? ""} maxLength={1000} rows={2} /></div>
      </fieldset>
      <p className="text-sm text-muted-foreground">{t("visibleToFamily")}</p>
      {error ? <p role="alert" className="text-sm font-semibold text-destructive">{t(`errors.${error}`)}</p> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-admin-action text-white hover:bg-brand-green-dark">{pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}{t(pending ? "saving" : "save")}</Button>
        <Button type="button" variant="outline" disabled={pending} onClick={onClose} className="min-h-11 rounded-xl">{t("cancel")}</Button>
        {error === "conflict" ? <Button type="button" variant="outline" onClick={() => { onClose(); router.refresh(); }} className="min-h-11 rounded-xl">{t("refresh")}</Button> : null}
      </div>
    </form>
  );
}
