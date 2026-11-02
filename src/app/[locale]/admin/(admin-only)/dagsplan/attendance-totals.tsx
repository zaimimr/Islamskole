import Link from "next/link";
import { ChevronDown, Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { loadDayAttendance, loadYearAttendance, type ReportClass } from "@/lib/attendance-report";
import type { AttendanceCounts, DayStatus } from "@/lib/lessons";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const COLUMNS: { status: DayStatus; label: string; dot: string }[] = [
  { status: "til_stede", label: "Møtt", dot: "bg-admin-action" },
  { status: "sent", label: "Forsinket", dot: "bg-brand-sun" },
  { status: "meldt_fravaer", label: "Meldt fravær", dot: "bg-brand-sky" },
  { status: "fravaer", label: "Ikke meldt fravær", dot: "bg-destructive" },
];

type SummaryRow = { id: string; name: string; counts: AttendanceCounts; unmarked?: number };

const headCell = "w-0 px-1.5 py-3 text-right sm:w-auto sm:px-3";
const bodyCell = "px-1.5 py-3 text-right tabular-nums sm:px-3";

function percentLabel(value: number | null) {
  return value === null ? "-" : `${value} %`;
}

export async function AttendanceTotals({
  basePath,
  yearId,
  yearLabel,
  day,
  wholeYear,
}: {
  basePath: string;
  yearId: string;
  yearLabel: string;
  day: { id: string };
  wholeYear: boolean;
}) {
  const href = `${basePath}/dagsplan?dag=${day.id}&visning=totalt`;
  const toggle = (
    <nav aria-label="Periode" className="inline-flex w-fit rounded-xl bg-[#EFECE4] p-1">
      {[
        { label: "Dag", href, active: !wholeYear },
        { label: "Hele året", href: `${href}&periode=aar`, active: wholeYear },
      ].map((item) => (
        <Link
          key={item.label}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            item.active ? "bg-white text-[#1D4E24] shadow-[0_1px_2px_rgb(31_42_34/0.12)]" : "text-admin-muted hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );

  const supabase = await createClient();

  if (!wholeYear) {
    const { classes, total } = await loadDayAttendance(supabase, yearId, day.id);
    return (
      <section aria-label="Oppmøte totalt" className="grid gap-4">
        {toggle}
        <MobileRows rows={[total, ...classes]} />
        <div className="hidden overflow-x-auto rounded-2xl bg-white ring-1 ring-[#E3DED3] sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#ECE8DF] text-left align-bottom text-xs font-bold text-admin-muted">
                <th scope="col" className="py-3 pr-1 pl-3 sm:px-4">Klasse</th>
                {COLUMNS.map((column) => (
                  <th key={column.status} scope="col" className={headCell}>{column.label}</th>
                ))}
                <th scope="col" className={headCell}>Ikke registrert</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECE8DF]">
              {[total, ...classes].map((row) => (
                <tr key={row.id} className={row.id === "total" ? "bg-[#F7F5F0] font-bold" : undefined}>
                  <th scope="row" className="py-3 pr-1 pl-3 text-left font-bold break-words sm:px-4">{row.name}</th>
                  {COLUMNS.map((column) => (
                    <td key={column.status} className={bodyCell}>{row.counts[column.status]}</td>
                  ))}
                  <td className={cn(bodyCell, row.unmarked ? "text-[#8A5A00]" : undefined)}>{row.unmarked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  const { classes, total } = await loadYearAttendance(supabase, yearId);

  return (
    <section aria-label="Oppmøte totalt" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {toggle}
        <a
          href="/api/export/oppmote"
          download
          className={cn(buttonVariants({ variant: "outline" }), "min-h-11 bg-white font-bold")}
        >
          <Download aria-hidden="true" />
          CSV
        </a>
      </div>
      <p className="text-sm text-admin-muted">Oppmøte = (møtt + forsinket) / registrerte dager. Meldt og ikke meldt fravær teller som fravær.</p>
      <div className="grid gap-1.5 rounded-2xl bg-[#F7F5F0] px-4 py-3 ring-1 ring-[#E3DED3]">
        <p className="flex items-baseline justify-between gap-3 font-heading text-xl font-bold">
          <span>Totalt <span className="sr-only">{yearLabel}</span></span>
          <span className="tabular-nums">{percentLabel(total.percent)}</span>
        </p>
        <CountList counts={total.counts} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        {classes.map((row) => <ClassReport key={row.id} row={row} />)}
      </div>
    </section>
  );
}

function ClassReport({ row }: { row: ReportClass }) {
  return (
    <details id={`klasse-${row.id}`} className="group scroll-mt-24 rounded-2xl bg-white ring-1 ring-[#E3DED3]">
      <summary className="grid min-h-14 cursor-pointer list-none gap-1.5 rounded-2xl px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-xl font-bold">{row.name}</h2>
          <span className="text-sm whitespace-nowrap text-admin-muted tabular-nums">{row.students.length} {row.students.length === 1 ? "elev" : "elever"}</span>
          <span className="ml-auto font-heading text-xl font-bold whitespace-nowrap tabular-nums">{percentLabel(row.percent)}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
        </div>
        <CountList counts={row.counts} />
      </summary>
      <ul className="divide-y divide-[#ECE8DF] border-t border-[#ECE8DF]">
        {row.students.map((student) => (
          <li key={student.id} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5">
            <span className="font-bold">{student.name}</span>
            <span className="text-right font-bold tabular-nums">{percentLabel(student.percent)}</span>
            <span className="col-span-2 text-sm text-admin-muted tabular-nums">
              {COLUMNS.map((column) => `${student.counts[column.status]} ${column.label.toLowerCase()}`).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function CountList({ counts, unmarked }: { counts: AttendanceCounts; unmarked?: number }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums">
      {COLUMNS.map((column) => (
        <li key={column.status} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("size-2.5 rounded-full", column.dot)} />
          <span><span className="font-bold">{counts[column.status]}</span> {column.label.toLowerCase()}</span>
        </li>
      ))}
      {unmarked === undefined ? null : (
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-foreground/25" />
          <span><span className="font-bold">{unmarked}</span> ikke registrert</span>
        </li>
      )}
    </ul>
  );
}

function MobileRows({ rows }: { rows: SummaryRow[] }) {
  return (
    <ul className="divide-y divide-[#ECE8DF] rounded-2xl bg-white ring-1 ring-[#E3DED3] sm:hidden">
      {rows.map((row) => (
        <li key={row.id} className={cn("grid gap-1.5 px-4 py-3", row.id === "total" && "rounded-t-2xl bg-[#F7F5F0]")}>
          <p className="font-bold">{row.name}</p>
          <CountList counts={row.counts} unmarked={row.unmarked} />
        </li>
      ))}
    </ul>
  );
}
