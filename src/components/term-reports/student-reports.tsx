import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { formatSchoolDay } from "@/lib/portal/teacher-days";
import { ReportEditor } from "./report-editor";

export async function StudentReports({ studentId, locale, staff = false }: { studentId: string; locale: string; staff?: boolean }) {
  const client = await createClient();
  const en = locale === "en";
  const { data, error } = await client.from("term_report_publications").select("id, term, version, published_at").eq("student_id", studentId).order("published_at", { ascending: false });
  const years = staff ? await client.rpc("term_report_years", { p_student_id: studentId }) : null;
  return <div className="grid gap-4">
    {staff && years?.data?.length ? <ReportEditor studentId={studentId} years={years.data} /> : null}
    {error ? <p role="status">{en ? "Could not load reports" : "Kunne ikke hente rapporter"}</p> : data?.length ? <section aria-label={en ? "Published reports" : "Publiserte rapporter"} className="grid gap-3"><h2 className="font-heading text-xl font-semibold">{en ? "Published reports" : "Publiserte rapporter"}</h2><ul className="grid gap-2">{data.map((row) => <li key={row.id}><Link className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-brand-green-dark hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50" href={`/min-side/rapporter/${row.id}`}>{row.term === "autumn" ? (en ? "Autumn report" : "Høstrapport") : (en ? "Spring report" : "Vårrapport")} · {formatSchoolDay(row.published_at.slice(0, 10), locale)} · {en ? "Version" : "Versjon"} {row.version}</Link></li>)}</ul></section> : null}
  </div>;
}
