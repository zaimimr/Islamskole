import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getLearningClassStudents } from "@/lib/learning-progress/data";
import { ProgressLoadError } from "./progress-load-error";

export async function ClassProgress({ classId }: { classId: string }) {
  const [t, result] = await Promise.all([getTranslations("learningProgress"), getLearningClassStudents(classId)]);
  if (result.ok && !result.data.length) return null;
  return (
    <section aria-labelledby="class-progress-title" className="grid gap-3">
      <h2 id="class-progress-title" className="font-heading text-2xl font-semibold">{t("title")}</h2>
      {result.ok ? <ul className="divide-y divide-foreground/10">{result.data.map((student) => (
        <li key={student.student_id}><Link href={`/min-side/klasse/${classId}/elev/${student.student_id}`} className="flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 py-3 font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"><span className="wrap-anywhere">{[student.first_name, student.last_name].filter(Boolean).join(" ")}</span><ChevronRight aria-hidden="true" className="size-5 shrink-0" /></Link></li>
      ))}</ul> : <ProgressLoadError />}
    </section>
  );
}
