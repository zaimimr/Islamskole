import { getIsAdmin } from "@/lib/auth";
import { loadYearAttendance, type AttendanceTally } from "@/lib/attendance-report";
import { createClient } from "@/lib/supabase/server";

const HEADERS = ["Klasse", "Elev", "Oppmøte %", "Møtt", "Forsinket", "Gyldig fravær", "Ugyldig fravær", "Registrerte dager"];

function escapeCsvField(value: unknown): string {
  if (value == null) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function line(className: string, name: string, tally: AttendanceTally) {
  return [
    className,
    name,
    tally.percent,
    tally.counts.til_stede,
    tally.counts.sent,
    tally.counts.meldt_fravaer,
    tally.counts.fravaer,
    tally.registered,
  ].map(escapeCsvField).join(";");
}

export async function GET() {
  if (!(await getIsAdmin())) return new Response("Ikke autorisert", { status: 403 });

  const supabase = await createClient();
  const { data: year } = await supabase.from("school_years").select("id, label").eq("is_active", true).maybeSingle();
  if (!year) return new Response("Ingen aktivt skoleår", { status: 404 });

  const { classes, total } = await loadYearAttendance(supabase, year.id);
  const lines = [HEADERS.join(";")];
  for (const row of classes) {
    for (const student of row.students) lines.push(line(row.name, student.name, student));
    lines.push(line(row.name, "Hele klassen", row));
  }
  lines.push(line("Totalt", "", total));

  return new Response(`﻿${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="oppmote-${year.label.replace(/[^\w-]+/g, "-")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
