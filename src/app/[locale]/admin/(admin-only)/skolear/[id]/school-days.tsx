"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, ChevronDown, Loader2 } from "lucide-react";
import {
  generateSchoolDays,
  setSchoolDayCancelled,
} from "@/app/[locale]/admin/portal-admin-actions";
import { Button } from "@/components/ui/button";
import { formatOsloDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type SchoolDayRow = {
  id: string;
  date: string;
  cancelled: boolean;
  note: string | null;
};

export function SchoolDays({
  schoolYearId,
  days,
  hasDates,
  today,
}: {
  schoolYearId: string;
  days: SchoolDayRow[];
  hasDates: boolean;
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shownDays, toggleShownDay] = useOptimistic(
    days,
    (current: SchoolDayRow[], id: string) =>
      current.map((day) =>
        day.id === id ? { ...day, cancelled: !day.cancelled } : day,
      ),
  );
  const cancelledCount = shownDays.filter((day) => day.cancelled).length;
  const nextDay = shownDays.find((day) => day.date >= today && !day.cancelled);

  function generate() {
    setBusyId("generate");
    startTransition(async () => {
      const result = await generateSchoolDays(schoolYearId);
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.count
          ? `La til ${result.count} ${result.count === 1 ? "søndag" : "søndager"}`
          : "Alle søndager finnes allerede",
      );
      router.refresh();
    });
  }

  function toggle(day: SchoolDayRow) {
    startTransition(async () => {
      toggleShownDay(day.id);
      const result = await setSchoolDayCancelled(day.id, !day.cancelled);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${formatOsloDate(day.date, { day: "numeric", month: "long" })} er ${day.cancelled ? "åpnet igjen" : "avlyst"}`,
      );
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby="school-days-title"
      className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
        <div>
          <h2 id="school-days-title" className="font-heading text-xl font-bold">
            Skoledager
          </h2>
          <p className="mt-0.5 text-sm text-admin-muted">
            {days.length === 0
              ? "Ingen skoledager ennå. Lærere fører oppmøte og foresatte melder fravær på disse dagene."
              : `${days.length} søndager${cancelledCount ? `, ${cancelledCount} avlyst` : ""}${
                  nextDay
                    ? `. Neste: ${formatOsloDate(nextDay.date, { weekday: "long", day: "numeric", month: "long" })}`
                    : ""
                }.`}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={pending || !hasDates}
          onClick={generate}
          className="min-h-11 rounded-xl bg-white px-3 font-bold"
        >
          {busyId === "generate" ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <CalendarPlus aria-hidden="true" className="size-4" />
          )}
          Generer søndager
        </Button>
      </div>
      {!hasDates ? (
        <p className="px-4 py-3 text-sm text-[#775108] sm:px-5">
          Legg inn start- og sluttdato under Innstillinger for skoleåret først.
        </p>
      ) : null}

      {days.length > 0 ? (
        <details className="group">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 text-sm font-bold outline-none hover:bg-[#FBFAF6] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 sm:px-5 [&::-webkit-details-marker]:hidden">
            Vis alle skoledager
            <ChevronDown
              aria-hidden="true"
              className="size-4 text-admin-muted transition-transform group-open:rotate-180"
            />
          </summary>
          <ul className="divide-y divide-[#ECE8DF] border-t border-[#ECE8DF]">
            {shownDays.map((day) => {
              const past = day.date < today;
              return (
                <li
                  key={day.id}
                  className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 sm:px-5"
                >
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block font-bold tabular-nums",
                        day.cancelled && "text-admin-muted line-through",
                        past && !day.cancelled && "text-admin-muted",
                      )}
                    >
                      {formatOsloDate(day.date, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    {day.cancelled || day.note ? (
                      <span className="block text-xs text-admin-muted">
                        {[day.cancelled ? "Avlyst" : null, day.note]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => toggle(day)}
                    aria-label={`${day.cancelled ? "Åpne igjen" : "Avlys"} ${formatOsloDate(day.date, { day: "numeric", month: "long", year: "numeric" })}`}
                    className={cn(
                      "min-h-11 shrink-0 rounded-xl bg-white px-3 font-bold",
                      !day.cancelled && "text-[#8B2F2B]",
                    )}
                  >
                      {day.cancelled ? "Åpne igjen" : "Avlys"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
