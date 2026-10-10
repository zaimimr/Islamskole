import type { ReportSnapshot } from "@/lib/term-reports/schema";
import { formatSchoolDay } from "@/lib/portal/teacher-days";

export function ReportView({ report, locale }: { report: ReportSnapshot; locale: string }) {
  const en = locale === "en";
  const status: Record<string, string> = { practising: en ? "Practising" : "Øver", achieved: en ? "Achieved" : "Mestret", needs_revision: en ? "Needs practice" : "Trenger mer øving" };
  const subjects: Record<string, string> = { quran: en ? "Quran" : "Koran", arabic: en ? "Arabic" : "Arabisk", islam: "Islam" };
  const counts = [
    [en ? "School Sundays" : "Skolesøndager", report.attendance.total],
    [en ? "Present" : "Til stede", report.attendance.present], [en ? "Late" : "Sent", report.attendance.late],
    [en ? "Reported absence" : "Meldt fravær", report.attendance.reportedAbsent], [en ? "Absent" : "Fravær", report.attendance.absent],
    [en ? "Not recorded" : "Ikke registrert", report.attendance.unrecorded],
  ] as const;
  return <div className="grid gap-6">
    <p className="text-sm text-muted-foreground">{report.yearLabel} · {formatSchoolDay(report.periodStart, locale)} - {formatSchoolDay(report.periodEnd, locale)}</p>
    {report.summary ? <section className="grid gap-2"><h2 className="font-heading text-xl font-semibold">{en ? "Teacher assessment" : "Lærerens vurdering"}</h2><p className="whitespace-pre-line wrap-anywhere">{report.summary}</p></section> : null}
    <section className="grid gap-3"><h2 className="font-heading text-xl font-semibold">{en ? "Attendance" : "Oppmøte"}</h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{counts.map(([label, count]) => <div key={label} className="rounded-xl bg-muted p-3"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-heading text-2xl font-semibold">{count}</dd></div>)}</dl>
    </section>
    <section className="grid gap-3"><h2 className="font-heading text-xl font-semibold">{en ? "Learning progress" : "Læringsutvikling"}</h2>
      {!report.goals.length ? <p className="text-muted-foreground">{en ? "No progress recorded" : "Ingen læringsutvikling registrert"}</p> : <ul className="grid gap-3">{report.goals.map((goal) => <li key={goal.id} className="grid gap-1 rounded-xl border p-3">
        <p className="text-sm text-muted-foreground">{subjects[goal.subject] ?? goal.subject}</p><p className="font-semibold wrap-anywhere">{goal.title}</p><p>{status[goal.status] ?? goal.status}</p>
        {goal.surah ? <p>{goal.surah}{goal.ayah_from ? ` ${goal.ayah_from}${goal.ayah_to ? `-${goal.ayah_to}` : ""}` : ""}</p> : null}
        {goal.feedback ? <p className="whitespace-pre-line wrap-anywhere">{goal.feedback}</p> : null}
        {goal.next_target ? <p className="whitespace-pre-line wrap-anywhere">{en ? "Next" : "Videre"}: {goal.next_target}</p> : null}
      </li>)}</ul>}
    </section>
    {report.nextSteps ? <section className="grid gap-2"><h2 className="font-heading text-xl font-semibold">{en ? "Next steps" : "Videre øving"}</h2><p className="whitespace-pre-line wrap-anywhere">{report.nextSteps}</p></section> : null}
  </div>;
}
