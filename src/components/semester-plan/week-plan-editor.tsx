"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { entryLabel, weekHeading, WeekEntryContent } from "@/components/semester-plan/week-entry";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import type { SlotRange, TimeSlot } from "@/lib/lessons";
import {
  entriesByWeek,
  focusWeek,
  previousWeek,
  weekPhase,
  type PlanWeek,
  type WeekPlanEntry,
} from "@/lib/semester-plan";
import { completeWeekPlanEntry, copyWeekPlan, deleteWeekPlanEntry, saveWeekPlanEntry } from "@/lib/portal/week-plan-actions";
import { cn } from "@/lib/utils";

type Block = SlotRange & { subject: string | null };

type Editing = { weekStart: string; entry: WeekPlanEntry | null };

const GENERAL = "all";

function blockKey(range: { start_position: number | null; end_position: number | null }) {
  return range.start_position === null ? GENERAL : `${range.start_position}-${range.end_position}`;
}

export function WeekPlanEditor({
  classId,
  schoolYearId,
  weeks,
  entries,
  slots,
  blocks,
  today,
}: {
  classId: string;
  schoolYearId: string;
  weeks: PlanWeek[];
  entries: WeekPlanEntry[];
  slots: TimeSlot[];
  blocks: Block[];
  today: string;
}) {
  const t = useTranslations("portal.semesterPlan");
  const tErrors = useTranslations("portal.errors");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<WeekPlanEntry | null>(null);
  const byWeek = entriesByWeek(entries);
  const focus = focusWeek(weeks, today);
  const past = weeks.filter((week) => focus === null || week.weekStart < focus).reverse();
  const coming = weeks.filter((week) => focus !== null && week.weekStart >= focus);
  const general = t("general");
  const allBlocks = [...blocks, ...entries.filter((entry): entry is WeekPlanEntry & Block => entry.start_position !== null)]
    .map((item) => ({ start_position: item.start_position, end_position: item.end_position, subject: item.subject }))
    .filter((item, index, list) => list.findIndex((other) => blockKey(other) === blockKey(item)) === index)
    .sort((left, right) => left.start_position - right.start_position);
  const blockOptions = [
    { value: GENERAL, label: general },
    ...allBlocks.map((block) => ({ value: blockKey(block), label: entryLabel(block, slots, general) })),
  ];

  function copyFrom(fromWeek: string, toWeek: string) {
    startTransition(async () => {
      const result = await copyWeekPlan({ classId, schoolYearId, fromWeek, toWeek });
      if (result.ok) toast.success(t("copied", { count: result.count ?? 0 }));
      else toast.error(tErrors(result.error));
    });
  }

  function remove(entry: WeekPlanEntry) {
    startTransition(async () => {
      const result = await deleteWeekPlanEntry(entry.id);
      setDeleting(null);
      if (result.ok) toast.success(t("deleted"));
      else toast.error(tErrors(result.error));
    });
  }

  const renderWeek = (week: PlanWeek) => {
    const heading = weekHeading(week.weekStart, week.dates, locale);
    const isFocus = week.weekStart === focus;
    const rows = byWeek.get(week.weekStart) ?? [];
    const previous = previousWeek(weeks, week.weekStart);
    const canCopy = previous !== null && (byWeek.get(previous)?.length ?? 0) > 0;
    const formHere = editing?.weekStart === week.weekStart;
    const laterWeeks = weeks.filter((item) => item.weekStart > week.weekStart).map((item) => item.weekStart);
    return (
      <li
        key={week.weekStart}
        data-week={week.weekStart}
        aria-current={isFocus ? "date" : undefined}
        className={cn(
          "grid gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/8 sm:p-5",
          isFocus && "ring-2 ring-primary/60",
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="font-heading text-lg font-semibold">
            {t("week", { number: heading.number })}
            <span className="font-sans text-sm font-normal text-foreground/70"> · {heading.days || t("noSchool")}</span>
          </h3>
          {isFocus ? (
            <span className="rounded-full bg-primary/12 px-3 py-1 text-sm font-semibold text-brand-green-dark">
              {weekPhase(week.weekStart, today) === "current" ? t("current") : t("next")}
            </span>
          ) : null}
        </div>

        {rows.length ? (
          <ul className="grid gap-3 lg:grid-cols-2">
            {rows.map((entry) =>
              formHere && editing?.entry?.id === entry.id ? null : (
                <li key={entry.id} className="flex items-start justify-between gap-2 rounded-xl bg-muted/50 p-3">
                  <WeekEntryContent entry={entry} label={entryLabel(entry, slots, general)} linkLabel={t("resource")} locale={locale} />
                  <div className="flex shrink-0 flex-col sm:flex-row">
                    <Button type="button" variant="ghost" size="icon" className="size-11" disabled={pending}
                      aria-label={locale === "en" ? `${entry.completed_at ? "Mark unfinished" : "Mark covered"}: ${entry.title}` : `${entry.completed_at ? "Merk som ikke gjennomført" : "Merk som gjennomført"}: ${entry.title}`}
                      onClick={() => startTransition(async () => {
                        const result = await completeWeekPlanEntry(entry.id, !entry.completed_at);
                        if (!result.ok) toast.error(tErrors(result.error));
                      })}>
                      <Check aria-hidden="true" className={cn("size-4", entry.completed_at ? "text-brand-green-dark" : "text-muted-foreground")} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={pending}
                      aria-label={t("edit", { title: entry.title })}
                      onClick={() => setEditing({ weekStart: week.weekStart, entry })}
                      className="size-11"
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={pending}
                      aria-label={t("delete", { title: entry.title })}
                      onClick={() => setDeleting(entry)}
                      className="size-11 text-destructive"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  </div>
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("weekEmpty")}</p>
        )}

        {formHere ? (
          <EntryForm
            key={editing?.entry?.id ?? "new"}
            entry={editing?.entry ?? null}
            blockOptions={blockOptions}
            blocks={allBlocks}
            laterWeeks={laterWeeks}
            pending={pending}
            onCancel={() => setEditing(null)}
            onSave={(draft, alsoWeeks) =>
              startTransition(async () => {
                const result = await saveWeekPlanEntry({
                  id: editing?.entry?.id ?? null,
                  classId,
                  schoolYearId,
                  weekStart: week.weekStart,
                  draft,
                  alsoWeeks,
                });
                if (result.ok) {
                  toast.success(t("saved", { count: result.count ?? 1 }));
                  setEditing(null);
                } else toast.error(tErrors(result.error));
              })
            }
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setEditing({ weekStart: week.weekStart, entry: null })}
              className="min-h-11"
            >
              <Plus aria-hidden="true" className="size-4" />
              {t("add")}
            </Button>
            {canCopy ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => copyFrom(previous as string, week.weekStart)}
                className="min-h-11"
              >
                {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Copy aria-hidden="true" className="size-4" />}
                {t("copyPrevious")}
              </Button>
            ) : null}
          </div>
        )}
      </li>
    );
  };

  if (!weeks.length) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;

  return (
    <div className="grid gap-3">
      {coming.length ? <ol className="grid gap-3">{coming.map(renderWeek)}</ol> : null}
      {past.length ? (
        <details className="group grid gap-3">
          <summary className="inline-flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg font-semibold text-brand-green-dark outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
            {t("past", { count: past.length })}
          </summary>
          <ol className="mt-3 grid gap-3">{past.map(renderWeek)}</ol>
        </details>
      ) : null}
      <AlertDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirm.title", { title: deleting?.title ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirm.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">{t("deleteConfirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => deleting && remove(deleting)}
              className="min-h-11"
            >
              {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
              {t("deleteConfirm.action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EntryForm({
  entry,
  blockOptions,
  blocks,
  laterWeeks,
  pending,
  onCancel,
  onSave,
}: {
  entry: WeekPlanEntry | null;
  blockOptions: { value: string; label: string }[];
  blocks: Block[];
  laterWeeks: string[];
  pending: boolean;
  onCancel: () => void;
  onSave: (
    draft: {
      start_position: number | null;
      end_position: number | null;
      subject: string | null;
      title: string;
      description: string | null;
      goals: string | null;
      resource_url: string | null;
    },
    alsoWeeks: string[],
  ) => void;
}) {
  const t = useTranslations("portal.semesterPlan.form");
  const [block, setBlock] = useState(entry ? blockKey(entry) : GENERAL);
  const [title, setTitle] = useState(entry?.title ?? "");
  const locale = useLocale();
  const [goals, setGoals] = useState(entry?.goals ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [link, setLink] = useState(entry?.resource_url ?? "");
  const [allWeeks, setAllWeeks] = useState(false);
  const formId = entry?.id ?? "new";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    const chosen = blocks.find((item) => blockKey(item) === block);
    onSave(
      {
        start_position: chosen?.start_position ?? null,
        end_position: chosen?.end_position ?? null,
        subject: chosen?.subject ?? (block === GENERAL && entry?.start_position === null ? entry.subject : null),
        title: title.trim(),
        description: description.trim() || null,
        goals: goals.trim() || null,
        resource_url: link.trim() || null,
      },
      allWeeks ? laterWeeks : [],
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 rounded-xl bg-muted/50 p-4">
      {blockOptions.length > 1 ? (
        <div className="grid gap-2">
          <span id={`plan-block-${formId}`} className="text-sm font-medium">
            {t("block")}
          </span>
          <SelectField
            aria-labelledby={`plan-block-${formId}`}
            options={blockOptions}
            value={block}
            onValueChange={setBlock}
            disabled={pending}
            triggerClassName="min-h-11 rounded-xl bg-card"
          />
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor={`plan-title-${formId}`}>{t("title")}</Label>
        <Input
          id={`plan-title-${formId}`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          required
          disabled={pending}
          placeholder={t("titlePlaceholder")}
          className="bg-card"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`plan-goals-${formId}`}>{locale === "en" ? "Learning goals" : "Læringsmål"}</Label>
        <Textarea id={`plan-goals-${formId}`} value={goals} onChange={(event) => setGoals(event.target.value)} maxLength={2000} rows={2} disabled={pending} className="bg-card text-base" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`plan-description-${formId}`}>{t("description")}</Label>
        <Textarea
          id={`plan-description-${formId}`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={4000}
          rows={3}
          disabled={pending}
          placeholder={t("descriptionPlaceholder")}
          className="min-h-24 bg-card text-base"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`plan-link-${formId}`}>{t("link")}</Label>
        <Input
          id={`plan-link-${formId}`}
          type="url"
          inputMode="url"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          maxLength={500}
          pattern="https?://.+"
          disabled={pending}
          placeholder="https://"
          className="bg-card"
        />
      </div>
      {!entry && laterWeeks.length ? (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={allWeeks}
            onChange={(event) => setAllWeeks(event.target.checked)}
            disabled={pending}
            className="size-5 shrink-0 accent-[var(--brand-green-dark)]"
          />
          {t("allWeeks")}
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || !title.trim()} className="min-h-11">
          {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
          {t("save")}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={onCancel} className="min-h-11">
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
