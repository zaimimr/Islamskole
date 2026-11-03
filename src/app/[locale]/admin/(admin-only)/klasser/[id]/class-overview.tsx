import Link from "next/link";
import { ClipboardCheck, Mail, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { ClassRecord } from "@/components/admin/class-form";
import { StatusPill } from "@/components/admin/status-pill";
import { slotRangeLabel, slotRangeTimes, type SlotPlan, type TimeSlot } from "@/lib/lessons";
import type { ClassTeacher } from "./class-teachers";

export function ClassOverview({ schoolClass, enrolled, teachers, teacherNames, slots, plans, attendanceHref, settingsHref }: {
  schoolClass: ClassRecord;
  enrolled: number;
  teachers: ClassTeacher[];
  teacherNames: Map<string, string>;
  slots: TimeSlot[];
  plans: SlotPlan[];
  attendanceHref?: string;
  settingsHref: string;
}) {
  const age = schoolClass.age_min != null && schoolClass.age_max != null
    ? `${schoolClass.age_min}-${schoolClass.age_max} år`
    : schoolClass.age_min != null ? `Fra ${schoolClass.age_min} år` : schoolClass.age_max != null ? `Til ${schoolClass.age_max} år` : "Ikke satt";
  return (
    <div className="min-w-0 divide-y divide-[#ECE8DF] overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
      <section aria-label="Klasseinfo" className="p-4 sm:p-5">
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div><dt className="text-admin-muted">Elever</dt><dd className="mt-1 font-bold tabular-nums">{enrolled}</dd></div>
          <div><dt className="text-admin-muted">Kapasitet</dt><dd className="mt-1 font-bold tabular-nums">{schoolClass.capacity ?? "Ikke satt"}</dd></div>
          <div><dt className="text-admin-muted">Alder</dt><dd className="mt-1 font-bold tabular-nums">{age}</dd></div>
        </dl>
      </section>
      <section aria-labelledby="class-overview-teachers" className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="class-overview-teachers" className="font-heading text-xl font-bold">Lærere</h2>
          {attendanceHref ? <Link href={attendanceHref} className={`${buttonVariants({ variant: "outline", size: "sm" })} min-h-11`}><ClipboardCheck aria-hidden="true" />Før oppmøte</Link> : null}
        </div>
        {teachers.length ? <ul className="mt-3 divide-y divide-[#ECE8DF]">
          {teachers.map((teacher) => <li key={teacher.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 wrap-anywhere font-bold">{teacher.name}{teacher.suspended ? <StatusPill tone="danger">Suspendert</StatusPill> : null}</p>
              {teacher.phone ? <a href={`tel:${teacher.phone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-admin-action underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"><Phone aria-hidden="true" className="size-3.5 shrink-0" />{teacher.phone}</a> : null}
            </div>
            {teacher.email ? <a href={`mailto:${teacher.email}`} aria-label={`Send e-post til ${teacher.name}`} className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-admin-action outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"><Mail aria-hidden="true" className="size-4" /></a> : null}
          </li>)}
        </ul> : <Link href={settingsHref} className="mt-2 inline-flex min-h-11 items-center font-bold text-admin-action underline-offset-4 hover:underline">Legg til lærer</Link>}
      </section>
      <section aria-labelledby="class-overview-timetable" className="p-4 sm:p-5">
        <h2 id="class-overview-timetable" className="font-heading text-xl font-bold">Timeplan</h2>
        {plans.length ? <ul className="mt-3 divide-y divide-[#ECE8DF]">
          {[...plans].sort((left, right) => left.start_position - right.start_position).map((plan) => {
            const names = [plan.teacher_guardian_id, plan.co_teacher_guardian_id].filter((id): id is string => Boolean(id)).map((id) => teacherNames.get(id) ?? "Ukjent lærer");
            return <li key={plan.start_position} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 py-3 text-sm first:pt-0 last:pb-0">
              <div><p className="font-bold">{slotRangeLabel(slots, plan)}</p><p className="mt-0.5 text-xs text-admin-muted tabular-nums">{slotRangeTimes(slots, plan)}</p></div>
              <div className="min-w-0 wrap-anywhere"><p className="font-bold">{plan.subject || "Fag ikke satt"}</p>{names.length ? <p className="mt-0.5 text-xs text-admin-muted">{names.join(", ")}</p> : null}</div>
            </li>;
          })}
        </ul> : <Link href={settingsHref} className="mt-2 inline-flex min-h-11 items-center font-bold text-admin-action underline-offset-4 hover:underline">Sett opp timeplan</Link>}
      </section>
    </div>
  );
}
