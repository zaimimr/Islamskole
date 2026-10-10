"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { prepareReport, publishReport, saveReport } from "@/lib/term-reports/actions";
import { reportSnapshotSchema } from "@/lib/term-reports/schema";
import type { Database } from "@/lib/supabase/types";
import { ReportView } from "./report-view";

type Draft = Database["public"]["Tables"]["term_reports"]["Row"];

export function ReportEditor({ studentId, years }: { studentId: string; years: { id: string; label: string }[] }) {
  const locale = useLocale();
  const en = locale === "en";
  const router = useRouter();
  const [yearId, setYearId] = useState(years[0]?.id ?? "");
  const [term, setTerm] = useState("autumn");
  const [report, setReport] = useState<Draft | null>(null);
  const [summary, setSummary] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const snapshot = reportSnapshotSchema.safeParse(report?.snapshot);
  const failure = (changed?: boolean) => setMessage(changed ? (en ? "The draft has changed. Open it again." : "Utkastet er endret. Åpne det på nytt.") : (en ? "Could not save report" : "Kunne ikke lagre rapporten"));
  function accept(value: Draft) { setReport(value); setSummary(value.summary); setNextSteps(value.next_steps); }
  function save(refresh = false, review = false) {
    if (!report) return;
    start(async () => {
      setMessage("");
      const result = await saveReport({ id: report.id, expected: report.updated_at, summary, nextSteps, refresh });
      if (!result.ok) { failure(result.changed); return; }
      accept(result.report);
      setReviewing(review);
      if (review) setRequestId(crypto.randomUUID());
      else setMessage(en ? "Draft saved" : "Utkast lagret");
    });
  }
  return <section aria-label={en ? "Report draft" : "Rapportutkast"} className="grid gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/8 sm:p-6">
    <h2 className="font-heading text-xl font-semibold">{en ? "End-of-term report" : "Semesterrapport"}</h2>
    <div className="flex flex-wrap gap-3"><SelectField aria-label={en ? "School year" : "Skoleår"} value={yearId} options={years.map((year) => ({ value: year.id, label: year.label }))} onValueChange={(id) => { setYearId(id); setReport(null); setReviewing(false); }} disabled={pending} />
      <SelectField aria-label={en ? "Term" : "Semester"} value={term} options={[{ value: "autumn", label: en ? "Autumn" : "Høst" }, { value: "spring", label: en ? "Spring" : "Vår" }]} onValueChange={(value) => { setTerm(value); setReport(null); setReviewing(false); }} disabled={pending} />
      <Button disabled={pending} onClick={() => start(async () => { setMessage(""); setReviewing(false); const result = await prepareReport({ studentId, yearId, term }); if (result.ok) accept(result.report); else failure(); })}>{en ? "Open draft" : "Åpne utkast"}</Button>
    </div>
    {report && snapshot.success ? <>
      {reviewing ? <><ReportView report={{ ...snapshot.data, summary, nextSteps }} locale={locale} /><p>{en ? "Publishing makes this report available to the child and guardians and emails guardians." : "Publisering gjør rapporten synlig for barnet og foresatte og sender e-post til foresatte."}</p>
        <div className="flex flex-wrap gap-3"><Button disabled={pending} onClick={() => start(async () => { const result = await publishReport({ id: report.id, expected: report.updated_at, requestId }); if (!result.ok) { failure(result.changed); return; } setReviewing(false); setMessage(en ? "Report published" : "Rapport publisert"); router.refresh(); })}>{en ? "Publish report" : "Publiser rapport"}</Button><Button variant="outline" disabled={pending} onClick={() => setReviewing(false)}>{en ? "Back to draft" : "Tilbake til utkast"}</Button></div>
      </> : <>
        <ReportView report={snapshot.data} locale={locale} />
        <div className="grid gap-2"><Label htmlFor={`report-summary-${studentId}`}>{en ? "Teacher assessment" : "Lærerens vurdering"}</Label><Textarea id={`report-summary-${studentId}`} value={summary} maxLength={6000} onChange={(event) => setSummary(event.target.value)} disabled={pending} /></div>
        <div className="grid gap-2"><Label htmlFor={`report-next-${studentId}`}>{en ? "Next steps" : "Videre øving"}</Label><Textarea id={`report-next-${studentId}`} value={nextSteps} maxLength={4000} onChange={(event) => setNextSteps(event.target.value)} disabled={pending} /></div>
        <div className="flex flex-wrap gap-3"><Button disabled={pending} onClick={() => save()}>{en ? "Save draft" : "Lagre utkast"}</Button><Button variant="outline" disabled={pending} onClick={() => save(true)}>{en ? "Refresh attendance and progress" : "Oppdater oppmøte og læringsutvikling"}</Button><Button variant="outline" disabled={pending || !summary.trim()} onClick={() => save(false, true)}>{en ? "Review before publishing" : "Se gjennom før publisering"}</Button></div>
      </>}
    </> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
