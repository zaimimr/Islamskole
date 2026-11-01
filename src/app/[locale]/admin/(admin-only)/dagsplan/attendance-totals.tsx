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
  { status: "meldt_fravaer", label: "Gyldig fravær", dot: "bg-brand-sky" },
  { status: "fravaer", label: "Ugyldig fravær", dot: "bg-destructive" },
];

type SummaryRow = { id: string; name: string; counts: AttendanceCounts; percent?: number | null; unmarked?: number };

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
            "inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
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
  const tableRows: SummaryRow[] = [
    { id: "total", name: "Totalt", counts: total.counts, percent: total.percent },
    ...classes,
  ];

  return (
    <section aria-label="Oppmøte totalt" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {toggle}
        <a
          href="/api/export/oppmote"
          download
          className={cn(buttonVariants({ variant: "outline" }), "bg-white font-bold")}
        >
          <Download aria-hidden="true" />
          CSV
        </a>
      </div>
      <p className="text-sm text-admin-muted">Oppmøte = (møtt + forsinket) / registrerte dager. Gyldig og ugyldig fravær teller som fravær.</p>
      <MobileRows rows={tableRows} />
      <div className="hidden overflow-x-auto rounded-2xl bg-white ring-1 ring-[#E3DED3] sm:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Oppmøte {yearLabel}</caption>
          <thead>
            <tr className="border-b border-[#ECE8DF] text-left align-bottom text-xs font-bold text-admin-muted">
              <th scope="col" className="py-3 pr-1 pl-3 sm:px-4">Klasse</th>
              <th scope="col" className={headCell}>Oppmøte</th>
              {COLUMNS.map((column) => (
                <th key={column.status} scope="col" className={headCell}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ECE8DF]">
            {tableRows.map((row) => (
              <tr key={row.id} className={row.id === "total" ? "bg-[#F7F5F0] font-bold" : undefined}>
                <th scope="row" className="py-3 pr-1 pl-3 text-left font-bold break-words sm:px-4">
                  {row.id === "total" ? row.name : (
                    <a href={`#klasse-${row.id}`} className="underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                      {row.name}
                    </a>
                  )}
                </th>
                <td className={cn(bodyCell, "font-bold")}>{percentLabel(row.percent ?? null)}</td>
                {COLUMNS.map((column) => (
                  <td key={column.status} className={bodyCell}>{row.counts[column.status]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <h2 className="font-heading text-xl font-bold">{row.name}</h2>
        <span className="text-sm whitespace-nowrap text-admin-muted tabular-nums">{row.students.length} {row.students.length === 1 ? "elev" : "elever"}</span>
        <span className="ml-auto font-heading text-xl font-bold whitespace-nowrap tabular-nums">{percentLabel(row.percent)}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
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

function MobileRows({ rows }: { rows: SummaryRow[] }) {
  return (
    <ul className="divide-y divide-[#ECE8DF] rounded-2xl bg-white ring-1 ring-[#E3DED3] sm:hidden">
      {rows.map((row) => (
        <li key={row.id} className={cn("grid gap-1.5 px-4 py-3", row.id === "total" && "rounded-t-2xl bg-[#F7F5F0]")}>
          <p className="flex items-baseline justify-between gap-3 font-bold">
            {row.id === "total" || row.percent === undefined ? <span>{row.name}</span> : (
              <a href={`#klasse-${row.id}`} className="underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                {row.name}
              </a>
            )}
            {row.percent === undefined ? null : <span className="tabular-nums">{percentLabel(row.percent)}</span>}
          </p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums">
            {COLUMNS.map((column) => (
              <li key={column.status} className="flex items-center gap-1.5">
                <span aria-hidden="true" className={cn("size-2.5 rounded-full", column.dot)} />
                <span><span className="font-bold">{row.counts[column.status]}</span> {column.label.toLowerCase()}</span>
              </li>
            ))}
            {row.unmarked === undefined ? null : (
              <li className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-full bg-foreground/25" />
                <span><span className="font-bold">{row.unmarked}</span> ikke registrert</span>
              </li>
            )}
          </ul>
        </li>
      ))}
    </ul>
  );
}
