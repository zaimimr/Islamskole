"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CalendarCheck, Combine, Loader2, Pencil, RotateCcw, Split } from "lucide-react";
import {
  mergeLessons,
  resetDayLessons,
  splitLesson,
  updateLesson,
} from "@/app/[locale]/admin/lesson-actions";
import { RowActionsMenu, type RowAction } from "@/components/admin/row-actions-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { rangesOverlap, slotRangeLabel, slotRangeTimes, type TimeSlot } from "@/lib/lessons";
import { cn } from "@/lib/utils";

export type DayPlanLesson = {
  id: string;
  classId: string;
  start_position: number;
  end_position: number;
  subject: string | null;
  teacherId: string | null;
  coTeacherId: string | null;
  teacherName: string | null;
  defaultTeacherName: string | null;
  isSubstitute: boolean;
  isOverride: boolean;
  cancelled: boolean;
  note: string | null;
  hasData: boolean;
  doubleBooked: boolean;
  needsSubstitute: boolean;
};

export type DayPlanClass = {
  id: string;
  name: string;
  classTeachers: string | null;
  lessons: DayPlanLesson[];
};

export type DayPlanTeacher = { id: string; name: string; suspended: boolean };

const NO_TEACHER = "none";

function lessonHeading(lesson: DayPlanLesson, slotCount: number) {
  if (lesson.subject) return lesson.subject;
  return lesson.start_position === 1 && lesson.end_position >= slotCount ? "Hele dagen" : "Uten fag";
}

export function DayPlanGrid({
  dayId,
  slots,
  classes,
  teachers,
}: {
  dayId: string;
  slots: TimeSlot[];
  classes: DayPlanClass[];
  teachers: DayPlanTeacher[];
}) {
  const [editing, setEditing] = useState<DayPlanLesson | null>(null);
  const allLessons = classes.flatMap((row) => row.lessons);
  const className = new Map(classes.map((row) => [row.id, row.name]));
  const columns = `minmax(10rem, 13rem) repeat(${Math.max(slots.length, 1)}, minmax(9rem, 1fr))`;

  function busyIn(lesson: DayPlanLesson, teacherId: string) {
    const clash = allLessons.find(
      (other) =>
        other.id !== lesson.id &&
        (other.teacherId === teacherId || other.coTeacherId === teacherId) &&
        !other.cancelled &&
        rangesOverlap(other, lesson),
    );
    return clash ? className.get(clash.classId) ?? "en annen klasse" : null;
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl bg-white ring-1 ring-[#E3DED3] md:block">
        <div
          role="table"
          aria-label="Dagsplan"
          className="grid"
          style={{ gridTemplateColumns: columns }}
        >
          <div role="row" className="contents">
            <div role="columnheader" className="border-b border-[#ECE8DF] px-4 py-3 text-xs font-bold text-admin-muted">
              Klasse
            </div>
            {slots.map((slot) => (
              <div
                key={slot.position}
                role="columnheader"
                className="border-b border-l border-[#ECE8DF] px-3 py-3 text-xs font-bold text-admin-muted"
              >
                <span className="block text-sm text-foreground">{slot.label}</span>
                <span className="tabular-nums">{slotRangeTimes(slots, { start_position: slot.position, end_position: slot.position })}</span>
              </div>
            ))}
          </div>
          {classes.map((row, rowIndex) => {
            const border = rowIndex < classes.length - 1 ? "border-b border-[#ECE8DF]" : "";
            const cells: React.ReactNode[] = [];
            for (let position = 1; position <= slots.length; position += 1) {
              const lesson = row.lessons.find((item) => item.start_position === position);
              if (lesson) {
                const span = Math.min(lesson.end_position, slots.length) - lesson.start_position + 1;
                cells.push(
                  <div
                    key={lesson.id}
                    role="cell"
                    className={cn("border-l border-[#ECE8DF] p-2", border)}
                    style={{ gridColumn: `span ${Math.max(span, 1)}` }}
                  >
                    <LessonCard
                      lesson={lesson}
                      row={row}
                      slots={slots}
                      onEdit={() => setEditing(lesson)}
                    />
                  </div>,
                );
                position = Math.max(lesson.end_position, position);
              } else if (!row.lessons.some((item) => item.start_position < position && item.end_position >= position)) {
                cells.push(
                  <div
                    key={`empty-${position}`}
                    role="cell"
                    className={cn("flex items-center border-l border-[#ECE8DF] px-3 text-sm text-admin-muted", border)}
                  >
                    Ingen time
                  </div>,
                );
              }
            }
            return (
              <div key={row.id} role="row" className="contents">
                <div role="rowheader" className={cn("flex items-start justify-between gap-2 px-4 py-3", border)}>
                  <span className="min-w-0">
                    <span className="block font-bold">{row.name}</span>
                    {row.classTeachers ? (
                      <span className="block text-xs text-admin-muted">{row.classTeachers}</span>
                    ) : null}
                  </span>
                  <ResetMenu dayId={dayId} classRow={row} />
                </div>
                {cells}
              </div>
            );
          })}
        </div>
      </div>

      <ul className="grid gap-4 md:hidden">
        {classes.map((row) => (
          <li key={row.id} className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
            <div className="flex items-start justify-between gap-2 border-b border-[#ECE8DF] px-4 py-3">
              <span className="min-w-0">
                <span className="block font-heading text-lg font-bold">{row.name}</span>
                {row.classTeachers ? (
                  <span className="block text-sm text-admin-muted">{row.classTeachers}</span>
                ) : null}
              </span>
              <ResetMenu dayId={dayId} classRow={row} />
            </div>
            <ol className="grid gap-2 p-3">
              {row.lessons.map((lesson) => (
                <li key={lesson.id}>
                  <LessonCard lesson={lesson} row={row} slots={slots} onEdit={() => setEditing(lesson)} showSlot />
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>

      {editing ? (
        <LessonDialog
          key={editing.id}
          lesson={editing}
          slots={slots}
          teacherOptions={teachers.map((teacher) => {
            const busy = busyIn(editing, teacher.id);
            return {
              value: teacher.id,
              label: teacher.name,
              description: teacher.suspended ? "Suspendert" : busy ? `Underviser i ${busy}` : undefined,
              disabled: teacher.suspended,
            };
          })}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function ResetMenu({ dayId, classRow }: { dayId: string; classRow: DayPlanClass }) {
  if (!classRow.lessons.some((lesson) => lesson.isOverride)) return null;
  return (
    <RowActionsMenu
      label={`Handlinger for ${classRow.name}`}
      actions={[
        {
          id: "reset",
          label: "Tilbakestill til timeplanen",
          icon: RotateCcw,
          run: () => resetDayLessons(dayId, classRow.id),
          success: `${classRow.name} følger timeplanen igjen`,
          confirm: {
            title: `Tilbakestille ${classRow.name}?`,
            description:
              "Vikarer, sammenslåinger og avlysninger for denne dagen fjernes. Timer med oppmøte eller notat beholdes.",
            confirmLabel: "Tilbakestill",
          },
        },
      ]}
    />
  );
}

function LessonCard({
  lesson,
  row,
  slots,
  onEdit,
  showSlot = false,
}: {
  lesson: DayPlanLesson;
  row: DayPlanClass;
  slots: TimeSlot[];
  onEdit: () => void;
  showSlot?: boolean;
}) {
  const next = row.lessons.find((item) => item.start_position === lesson.end_position + 1);
  const actions: RowAction[] = [];
  if (next && !next.hasData) {
    actions.push({
      id: "merge",
      label: "Slå sammen med neste time",
      icon: Combine,
      run: () => mergeLessons(lesson.id, next.id),
      success: "Timene er slått sammen",
    });
  }
  if (lesson.end_position > lesson.start_position) {
    actions.push({
      id: "split",
      label: "Del opp i enkelttimer",
      icon: Split,
      run: () => splitLesson(lesson.id),
      success: "Timen er delt opp",
    });
  }
  actions.push(
    lesson.cancelled
      ? {
          id: "restore",
          label: "Gjenopprett timen",
          icon: CalendarCheck,
          run: () =>
            updateLesson(lesson.id, {
              subject: lesson.subject,
              teacherGuardianId: lesson.teacherId,
              coTeacherGuardianId: lesson.coTeacherId,
              cancelled: false,
              note: lesson.note,
            }),
          success: "Timen er gjenopprettet",
        }
      : {
          id: "cancel",
          label: "Avlys timen",
          icon: Ban,
          destructive: true,
          run: () =>
            updateLesson(lesson.id, {
              subject: lesson.subject,
              teacherGuardianId: lesson.teacherId,
              coTeacherGuardianId: lesson.coTeacherId,
              cancelled: true,
              note: lesson.note,
            }),
          success: "Timen er avlyst",
          confirm: {
            title: "Avlyse timen?",
            description: "Læreren kan ikke føre oppmøte, og foreldrene ser at timen er avlyst.",
            confirmLabel: "Avlys",
          },
        },
  );

  const teacherLine = lesson.teacherName
    ? lesson.teacherName
    : row.classTeachers
      ? `Klasselærer: ${row.classTeachers}`
      : "Ingen lærer";

  return (
    <article
      className={cn(
        "grid h-full gap-1.5 rounded-xl p-3 ring-1",
        lesson.cancelled
          ? "bg-[#F1EFEA] ring-[#E3DED3]"
          : lesson.needsSubstitute || lesson.doubleBooked
            ? "bg-[#FBE7E4] ring-[#E8B4AD]"
            : lesson.isSubstitute
              ? "bg-[#FEF4DE] ring-[#ECDCB9]"
              : "bg-[#F7FAF5] ring-[#DCE8D8]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {showSlot ? (
            <p className="text-xs font-bold text-admin-muted tabular-nums">
              {slotRangeLabel(slots, lesson)} · {slotRangeTimes(slots, lesson)}
            </p>
          ) : lesson.end_position > lesson.start_position ? (
            <p className="text-xs font-bold text-admin-muted tabular-nums">{slotRangeTimes(slots, lesson)}</p>
          ) : null}
          <p className={cn("font-bold", lesson.cancelled && "text-admin-muted line-through")}>
            {lessonHeading(lesson, slots.length)}
          </p>
          <p className="text-sm">{teacherLine}</p>
          {lesson.isSubstitute && lesson.defaultTeacherName ? (
            <p className="text-xs text-[#775108]">Vikar for {lesson.defaultTeacherName}</p>
          ) : null}
          {lesson.note ? <p className="mt-1 text-xs text-admin-muted">{lesson.note}</p> : null}
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onEdit}
            aria-label={`Endre ${lessonHeading(lesson, slots.length)} i ${row.name}`}
            title="Endre timen"
            className="size-11 rounded-xl"
          >
            <Pencil aria-hidden="true" className="size-4" />
          </Button>
          <RowActionsMenu label={`Flere valg for ${lessonHeading(lesson, slots.length)} i ${row.name}`} actions={actions} />
        </div>
      </div>
      <p className="flex flex-wrap gap-1.5">
        {lesson.needsSubstitute ? <Badge tone="danger">Mangler vikar</Badge> : null}
        {lesson.isSubstitute ? <Badge tone="warn">Vikar</Badge> : null}
        {lesson.doubleBooked ? <Badge tone="danger">Dobbeltbooket</Badge> : null}
        {lesson.cancelled ? <Badge tone="neutral">Avlyst</Badge> : null}
        {lesson.isOverride && !lesson.isSubstitute && !lesson.cancelled ? <Badge tone="info">Endret i dag</Badge> : null}
      </p>
    </article>
  );
}

function Badge({ tone, children }: { tone: "warn" | "danger" | "neutral" | "info"; children: React.ReactNode }) {
  const tones = {
    warn: "bg-[#FEEDCA] text-[#775108]",
    danger: "bg-[#F9DEDB] text-[#8B2F2B]",
    neutral: "bg-[#E7E4DC] text-[#4D554F]",
    info: "bg-[#DDEEF9] text-[#245D84]",
  };
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", tones[tone])}>{children}</span>;
}

function LessonDialog({
  lesson,
  slots,
  teacherOptions,
  onClose,
}: {
  lesson: DayPlanLesson;
  slots: TimeSlot[];
  teacherOptions: { value: string; label: string; description?: string; disabled?: boolean }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState(lesson.subject ?? "");
  const [teacher, setTeacher] = useState(lesson.teacherId ?? NO_TEACHER);
  const [coTeacher, setCoTeacher] = useState(lesson.coTeacherId ?? NO_TEACHER);
  const [note, setNote] = useState(lesson.note ?? "");
  const [cancelled, setCancelled] = useState(lesson.cancelled);

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateLesson(lesson.id, {
        subject: subject.trim() || null,
        teacherGuardianId: teacher === NO_TEACHER ? null : teacher,
        coTeacherGuardianId: coTeacher === NO_TEACHER ? null : coTeacher,
        cancelled,
        note: note.trim() || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Timen er oppdatert");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">Endre time</DialogTitle>
            <DialogDescription>
              {slotRangeLabel(slots, lesson)} · {slotRangeTimes(slots, lesson)}. Endringen gjelder bare denne dagen.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="lesson-subject">Fag</Label>
            <Input
              id="lesson-subject"
              value={subject}
              maxLength={120}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="For eksempel Islam"
            />
          </div>
          <div className="grid gap-1.5">
            <Label id="lesson-teacher-label">Lærer</Label>
            <SelectField
              aria-labelledby="lesson-teacher-label"
              options={[{ value: NO_TEACHER, label: "Klasselærerne" }, ...teacherOptions]}
              value={teacher}
              onValueChange={(value) => {
                setTeacher(value);
                if (value === coTeacher) setCoTeacher(NO_TEACHER);
              }}
              triggerClassName="min-h-11 rounded-xl"
            />
            {lesson.defaultTeacherName ? (
              <p className="text-xs text-admin-muted">Fast lærer: {lesson.defaultTeacherName}</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label id="lesson-co-teacher-label">Medlærer</Label>
            <SelectField
              aria-labelledby="lesson-co-teacher-label"
              options={[
                { value: NO_TEACHER, label: "Ingen medlærer" },
                ...teacherOptions.map((option) => ({
                  ...option,
                  disabled: option.disabled || option.value === teacher,
                })),
              ]}
              value={coTeacher}
              onValueChange={setCoTeacher}
              triggerClassName="min-h-11 rounded-xl"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lesson-note">Merknad</Label>
            <Textarea
              id="lesson-note"
              value={note}
              maxLength={500}
              rows={2}
              aria-describedby="lesson-note-hint"
              onChange={(event) => setNote(event.target.value)}
            />
            <p id="lesson-note-hint" className="text-xs text-admin-muted">
              Lærere, foreldre og elever i klassen kan se merknaden på Min side.
            </p>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm font-bold">
            <Switch checked={cancelled} onCheckedChange={setCancelled} />
            Timen er avlyst
          </label>
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
