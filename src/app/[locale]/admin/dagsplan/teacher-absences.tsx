"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellOff, BellRing, Loader2, Pencil, Trash2, UserRoundX } from "lucide-react";
import { removeTeacherAbsence, saveTeacherAbsence } from "@/app/[locale]/admin/lesson-actions";
import { NoticeBadge } from "@/components/admin/notice-badge";
import { RowActionsMenu } from "@/components/admin/row-actions-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";

export type TeacherAbsenceRow = {
  id: string;
  guardianId: string;
  name: string;
  notified: boolean;
  reason: string | null;
  byTeacher: boolean;
  missingLessons: number;
};

type Draft = { guardianId: string; notified: boolean; reason: string };

export function TeacherAbsences({
  dayId,
  dayLabel,
  absences,
  teachers,
}: {
  dayId: string;
  dayLabel: string;
  absences: TeacherAbsenceRow[];
  teachers: { id: string; name: string }[];
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const absentIds = new Set(absences.map((row) => row.guardianId));
  const editing = draft ? absentIds.has(draft.guardianId) : false;

  return (
    <section aria-labelledby="teacher-absences-title" className="rounded-2xl bg-white ring-1 ring-[#E3DED3]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <h2 id="teacher-absences-title" className="font-heading text-lg font-bold">
          Lærere borte
          {absences.length ? <span className="ml-2 text-admin-muted tabular-nums">{absences.length}</span> : null}
        </h2>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-xl px-4 font-bold"
          onClick={() => setDraft({ guardianId: "", notified: true, reason: "" })}
        >
          <UserRoundX aria-hidden="true" className="size-4" />
          Registrer fravær
        </Button>
      </div>
      {absences.length ? (
        <ul className="divide-y divide-[#ECE8DF] border-t border-[#ECE8DF]">
          {absences.map((row) => (
            <li key={row.id} className="flex items-start gap-1 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1 py-1.5">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{row.name}</span>
                  <NoticeBadge notified={row.notified} />
                  {row.missingLessons ? (
                    <span className="rounded-full bg-[#F9DEDB] px-2 py-0.5 text-xs font-bold text-[#8B2F2B]">
                      {row.missingLessons} {row.missingLessons === 1 ? "time" : "timer"} mangler vikar
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-sm text-admin-muted empty:hidden">
                  {[row.byTeacher ? "Meldt av læreren" : null, row.reason].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 rounded-xl"
                aria-label={`Endre fraværet for ${row.name}`}
                title="Endre"
                onClick={() => setDraft({ guardianId: row.guardianId, notified: row.notified, reason: row.reason ?? "" })}
              >
                <Pencil aria-hidden="true" className="size-4" />
              </Button>
              <RowActionsMenu
                label={`Handlinger for ${row.name}`}
                actions={[
                  {
                    id: "toggle",
                    label: row.notified ? "Merk som ikke varslet" : "Merk som varslet",
                    icon: row.notified ? BellOff : BellRing,
                    run: () =>
                      saveTeacherAbsence({
                        guardianId: row.guardianId,
                        schoolDayId: dayId,
                        notified: !row.notified,
                        reason: row.reason,
                      }),
                    success: "Fraværet er oppdatert",
                  },
                  {
                    id: "remove",
                    label: "Fjern fraværet",
                    icon: Trash2,
                    destructive: true,
                    run: () => removeTeacherAbsence(row.id),
                    success: "Fraværet er fjernet",
                    confirm: {
                      title: `Fjerne fraværet for ${row.name}?`,
                      description: "Timene til læreren regnes som dekket igjen.",
                      confirmLabel: "Fjern",
                    },
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {draft ? (
        <AbsenceDialog
          key={draft.guardianId || "new"}
          dayId={dayId}
          dayLabel={dayLabel}
          draft={draft}
          editing={editing}
          teacherOptions={teachers.map((teacher) => ({
            value: teacher.id,
            label: teacher.name,
            disabled: !editing && absentIds.has(teacher.id),
          }))}
          onClose={() => setDraft(null)}
        />
      ) : null}
    </section>
  );
}

function AbsenceDialog({
  dayId,
  dayLabel,
  draft,
  editing,
  teacherOptions,
  onClose,
}: {
  dayId: string;
  dayLabel: string;
  draft: Draft;
  editing: boolean;
  teacherOptions: { value: string; label: string; disabled?: boolean }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [guardianId, setGuardianId] = useState(draft.guardianId);
  const [notified, setNotified] = useState(draft.notified);
  const [reason, setReason] = useState(draft.reason);

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!guardianId) {
      toast.error("Velg lærer.");
      return;
    }
    startTransition(async () => {
      const result = await saveTeacherAbsence({
        guardianId,
        schoolDayId: dayId,
        notified,
        reason: reason.trim() || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Fraværet er registrert");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">Lærer borte</DialogTitle>
            <DialogDescription>{dayLabel}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label id="absence-teacher-label">Lærer</Label>
            <SelectField
              aria-labelledby="absence-teacher-label"
              options={teacherOptions}
              value={guardianId}
              onValueChange={setGuardianId}
              placeholder="Velg lærer"
              disabled={editing}
              triggerClassName="min-h-11 rounded-xl"
            />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-bold">Varsel</legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: true, label: "Varslet" },
                { value: false, label: "Ikke varslet" },
              ].map((option) => (
                <label
                  key={option.label}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 ring-1 ring-[#DCD7CC] has-checked:bg-[#F2F7F2] has-checked:ring-2 has-checked:ring-[#3C8F44] has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                >
                  <input
                    type="radio"
                    name="notified"
                    checked={notified === option.value}
                    onChange={() => setNotified(option.value)}
                    className="size-4 accent-[#2F7938]"
                  />
                  <span className="font-bold">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor="absence-reason">Grunn</Label>
            <Textarea
              id="absence-reason"
              value={reason}
              maxLength={500}
              rows={2}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <DialogFooter className="[&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:rounded-xl [&_[data-slot=button]]:px-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Avbryt
            </Button>
            <Button type="submit" disabled={pending} className="bg-admin-action font-bold text-white hover:bg-[#245E2B]">
              {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
              Lagre
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
