import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getUser } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { reportSnapshotSchema } from "@/lib/term-reports/schema";
import { ReportView } from "@/components/term-reports/report-view";
import { PrintReport } from "@/components/term-reports/print-report";

export default async function ReportPage({ params }: PageProps<"/[locale]/min-side/rapporter/[reportId]">) {
  const { locale, reportId } = await params;
  setRequestLocale(locale);
  if (!(await getUser())) redirect({ href: "/min-side/logg-inn", locale });
  const { data, error } = await (await createClient()).from("term_report_publications").select("snapshot, version").eq("id", reportId).maybeSingle();
  if (error) throw new Error("Report unavailable");
  if (!data) notFound();
  const report = reportSnapshotSchema.safeParse(data.snapshot);
  if (!report.success) throw new Error("Report format unavailable");
  return <article className="report-print grid gap-6"><header className="grid gap-3"><h1 className="font-heading text-3xl font-semibold">{report.data.studentName}</h1><p className="font-heading text-xl">{locale === "en" ? "End-of-term report" : "Semesterrapport"} · {locale === "en" ? "Version" : "Versjon"} {data.version}</p><PrintReport locale={locale} /></header><ReportView report={report.data} locale={locale} /></article>;
}
