"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, CalendarX2, Loader2, Undo2 } from "lucide-react";
import { reportTeacherAbsence, withdrawTeacherAbsence } from "@/lib/portal/teacher-actions";
import type { PortalErrorCode } from "@/lib/portal/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type AbsenceDay = { id: string; label: string; reported: boolean };
type AbsenceItem = { id: string; label: string; reason: string | null; byAdmin: boolean; canUndo: boolean };

export function TeacherAbsence({ days, absences }: { days: AbsenceDay[]; absences: AbsenceItem[] }) {
  const t = useTranslations("portal");
  const [open, setOpen] = useState(false);
  const [dayId, setDayId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<PortalErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const openDays = days.filter((day) => !day.reported);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDayId(openDays[0]?.id ?? "");
      setReason("");
      setError(null);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dayId) {
      setError("invalid");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await reportTeacherAbsence(dayId, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success(t("teacher.away.sent"));
    });
  }

  function handleWithdraw(id: string) {
    setWithdrawingId(id);
    startTransition(async () => {
      const result = await withdrawTeacherAbsence(id);
      setWithdrawingId(null);
      if (result.ok) toast.success(t("teacher.away.withdrawn"));
      else toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <section aria-labelledby="teacher-away-title" className="grid gap-3">
      <h3 id="teacher-away-title" className="text-xl font-bold">
        {t("teacher.away.title")}
      </h3>
      {absences.length ? (
        <ul className="grid gap-2">
          {absences.map((absence) => (
            <li
              key={absence.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-secondary/70 py-2 pr-2 pl-4 text-secondary-foreground"
            >
              <p className="mr-auto min-w-0 py-1.5 text-sm">
                <span className="font-semibold first-letter:uppercase">
                  {t("teacher.away.reportedFor", { day: absence.label })}
                </span>
                {absence.reason || absence.byAdmin ? (
                  <span className="block text-secondary-foreground/85">
                    {[absence.byAdmin ? t("teacher.away.byAdmin") : null, absence.reason].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </p>
              {absence.canUndo ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleWithdraw(absence.id)}
                  disabled={pending}
                  aria-label={t("teacher.away.undoFor", { day: absence.label })}
                  className="min-h-11 text-secondary-foreground hover:bg-secondary"
                >
                  {withdrawingId === absence.id ? (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  ) : (
                    <Undo2 aria-hidden="true" />
                  )}
                  {t("teacher.away.undo")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {days.length ? (
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger
            render={
              <Button type="button" variant="outline" className="min-h-11 w-full sm:w-fit" disabled={!openDays.length} />
            }
          >
            <CalendarX2 aria-hidden="true" />
            {t("teacher.away.open")}
          </DialogTrigger>
          <DialogContent closeLabel={t("common.close")} className="gap-5 rounded-3xl p-5 sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="pr-8 font-heading text-xl font-semibold">{t("teacher.away.dialogTitle")}</DialogTitle>
              <DialogDescription>{t("teacher.away.intro")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid gap-5">
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-semibold">{t("teacher.away.dayLabel")}</legend>
                {days.map((day) => (
                  <label
                    key={day.id}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-foreground/10 transition-colors has-checked:bg-primary/10 has-checked:ring-2 has-checked:ring-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                      day.reported && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input
                      type="radio"
                      name="teacher_away_day"
                      value={day.id}
                      checked={dayId === day.id}
                      disabled={day.reported}
                      onChange={() => setDayId(day.id)}
                      className="size-4 accent-[var(--brand-green-dark)]"
                    />
                    <span className="first-letter:uppercase">{day.label}</span>
                    {day.reported ? (
                      <span className="ml-auto text-xs font-semibold text-muted-foreground">
                        {t("teacher.away.alreadyReported")}
                      </span>
                    ) : null}
                  </label>
                ))}
              </fieldset>
              <div className="grid gap-2">
                <Label htmlFor="teacher-away-reason">{t("teacher.away.reasonLabel")}</Label>
                <Textarea
                  id="teacher-away-reason"
                  value={reason}
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  className="min-h-20 text-base"
                />
              </div>
              {error ? (
                <p role="alert" className="flex gap-2 rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  {t(`errors.${error}`)}
                </p>
              ) : null}
              <DialogFooter className="-mx-5 -mb-5 rounded-b-3xl p-5">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={pending || !dayId}>
                  {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                  {t("teacher.away.submit")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}
