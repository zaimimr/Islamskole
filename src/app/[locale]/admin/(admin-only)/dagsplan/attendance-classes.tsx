"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Pencil } from "lucide-react";
import { AttendanceRoster } from "@/components/portal/teacher/attendance-roster";
import { Button } from "@/components/ui/button";
import type { PortalRosterRow } from "@/lib/portal/types";
import type { DayPlanLesson } from "./day-plan-grid";
import { cn } from "@/lib/utils";

type ClassRoster = { id: string; name: string; classTeachers: string | null; lesson: DayPlanLesson | null; students: PortalRosterRow[] };

export function AttendanceClasses({ basePath, day, rows, selectedClass, future }: {
  basePath: string;
  day: { id: string; cancelled: boolean };
  rows: ClassRoster[];
  selectedClass: string;
  future: boolean;
}) {
  const [expandedIds, setExpandedIds] = useState<string[]>(rows[0] ? [rows[0].id] : []);
  const allOpen = rows.every((row) => expandedIds.includes(row.id));
  const expand = (id: string) => setExpandedIds((current) => current.includes(id) ? current : [...current, id]);
  const toggle = (id: string) => setExpandedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);

  return (
    <div className="grid gap-3">
      {selectedClass === "alle" && rows.length > 1 ? <Button type="button" variant="ghost" className="min-h-11 justify-self-end" onClick={() => setExpandedIds(allOpen ? [] : rows.map((row) => row.id))}>{allOpen ? "Skjul elevlister" : "Vis alle elevlister"}</Button> : null}
      {rows.map((row) => {
        const lesson = row.lesson;
        const open = selectedClass !== "alle" || expandedIds.includes(row.id);
        const available = lesson?.availableTeacherNames ?? [];
        const absent = lesson?.absentTeacherNames ?? [];
        const state = day.cancelled || lesson?.cancelled ? "Avlyst" : lesson?.needsSubstitute ? "Mangler vikar" : !available.length ? "Ingen lærer satt opp" : lesson?.isSubstitute ? "Vikar" : future ? "Satt opp" : "Tilstede";
        const header = (
          <div className="flex items-start gap-1 px-3 pt-2">
            <button type="button" aria-expanded={open} onClick={() => toggle(row.id)} disabled={selectedClass !== "alle"} className="flex min-h-14 min-w-0 flex-1 items-start gap-2 rounded-lg py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="font-heading text-xl font-bold">{row.name}</span>
                <span className={cn("text-sm", lesson?.needsSubstitute || !available.length ? "font-semibold text-destructive" : "text-admin-muted")}>{state}{available.length ? `: ${available.join(", ")}` : ""}</span>
                {absent.length ? <span className="text-xs text-destructive">Borte: {absent.join(", ")}</span> : null}
                {lesson?.subject ? <span className="text-xs text-admin-muted">{lesson.subject}</span> : null}
              </span>
              {selectedClass === "alle" ? <ChevronDown aria-hidden="true" className={cn("mt-1 size-4 shrink-0 transition-transform", open && "rotate-180")} /> : null}
            </button>
            <Link href={`${basePath}/dagsplan?dag=${day.id}&visning=timeplan&klasse=${row.id}`} className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-admin-muted outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={`Endre timer og lærere for ${row.name}`}><Pencil aria-hidden="true" className="size-4" /></Link>
          </div>
        );
        return (
          <section key={row.id} aria-label={row.name} className="overflow-hidden rounded-xl bg-white pb-2 ring-1 ring-[#E3DED3]">
            {lesson ? <AttendanceRoster key={lesson.id} header={header} rows={row.students} lessonId={lesson.id} markable={!day.cancelled && !lesson.cancelled && !future} reportable={!day.cancelled && !lesson.cancelled && future} expanded={open} onExpand={() => expand(row.id)} studentBasePath={`${basePath}/elever/`} /> : <>{header}<p className="px-3 py-3 text-sm text-admin-muted">Ingen time</p></>}
          </section>
        );
      })}
    </div>
  );
}
