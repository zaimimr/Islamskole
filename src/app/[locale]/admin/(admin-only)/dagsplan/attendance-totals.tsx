import { osloToday } from "@/lib/dates";
import { collapseDayStatus, type DayStatus } from "@/lib/lessons";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 1000;

type Counts = Record<DayStatus, number>;

const COLUMNS: { status: DayStatus; label: string }[] = [
  { status: "til_stede", label: "Oppmøte" },
  { status: "sent", label: "Forsinket" },
  { status: "meldt_fravaer", label: "Reg. fravær" },
  { status: "fravaer", label: "Ureg. fravær" },
];

function emptyCounts(): Counts {
  return { til_stede: 0, sent: 0, meldt_fravaer: 0, fravaer: 0 };
}

export async function AttendanceTotals({ yearId }: { yearId: string }) {
  const supabase = await createClient();
  const [{ data: dayData, error: dayError }, { data: enrollmentData, error: enrollmentError }] = await Promise.all([
    supabase
      .from("school_days")
      .select("id")
      .eq("school_year_id", yearId)
      .eq("cancelled", false)
      .lte("date", osloToday()),
    supabase
      .from("enrollments")
      .select("student_id, class_id, class:classes!inner(name_no, sort_order)")
      .eq("school_year_id", yearId)
      .eq("status", "aktiv"),
  ]);
  if (dayError || enrollmentError) throw new Error("Kunne ikke hente oppmøte.");

  const dayIds = (dayData ?? []).map((row) => row.id);
  const rows: { student_id: string; school_day_id: string; status: string }[] = [];
  for (let start = 0; dayIds.length; start += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("attendance")
      .select("student_id, school_day_id, status")
      .in("school_day_id", dayIds)
      .order("id", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw new Error("Kunne ikke hente oppmøte.");
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }

  const classOf = new Map((enrollmentData ?? []).map((row) => [row.student_id, row.class_id]));
  const statuses = new Map<string, DayStatus[]>();
  for (const row of rows) {
    if (!classOf.has(row.student_id)) continue;
    const key = `${row.student_id}:${row.school_day_id}`;
    statuses.set(key, [...(statuses.get(key) ?? []), row.status as DayStatus]);
  }

  const total = emptyCounts();
  const byClass = new Map<string, Counts>();
  for (const [key, list] of statuses) {
    const status = collapseDayStatus(list);
    if (!status) continue;
    const classId = classOf.get(key.split(":")[0]) as string;
    const counts = byClass.get(classId) ?? emptyCounts();
    counts[status] += 1;
    total[status] += 1;
    byClass.set(classId, counts);
  }

  const classes = [
    ...new Map(
      (enrollmentData ?? []).map((row) => [
        row.class_id,
        { id: row.class_id, name: row.class?.name_no ?? "Klasse uten navn", sortOrder: row.class?.sort_order ?? 0 },
      ]),
    ).values(),
  ].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "nb-NO"));

  const tableRows = [
    { id: "total", name: "Totalt", counts: total },
    ...classes.map((row) => ({ id: row.id, name: row.name, counts: byClass.get(row.id) ?? emptyCounts() })),
  ];

  return (
    <section aria-label="Oppmøte totalt" className="overflow-x-auto rounded-2xl bg-white ring-1 ring-[#E3DED3]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#ECE8DF] text-left align-bottom text-xs font-bold text-admin-muted">
            <th scope="col" className="py-3 pr-1 pl-3 sm:px-4">Klasse</th>
            {COLUMNS.map((column) => (
              <th key={column.status} scope="col" className="w-0 px-1.5 py-3 text-right sm:w-auto sm:px-3">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#ECE8DF]">
          {tableRows.map((row) => (
            <tr key={row.id} className={row.id === "total" ? "bg-[#F7F5F0] font-bold" : undefined}>
              <th scope="row" className="py-3 pr-1 pl-3 text-left font-bold break-words sm:px-4">{row.name}</th>
              {COLUMNS.map((column) => (
                <td key={column.status} className="px-1.5 py-3 text-right tabular-nums sm:px-3">
                  {row.counts[column.status]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
