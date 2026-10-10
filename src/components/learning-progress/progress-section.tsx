import { getTranslations } from "next-intl/server";
import { getLearningGoals } from "@/lib/learning-progress/data";
import { ProgressPanel } from "./progress-panel";
import { ProgressLoadError } from "./progress-load-error";

export async function LearningProgressSection({ studentId, classId }: { studentId: string; classId?: string | null }) {
  const [t, result] = await Promise.all([getTranslations("learningProgress"), getLearningGoals(studentId)]);
  return (
    <section id="learning-progress" aria-labelledby="learning-progress-title" className="grid gap-4">
      <h2 id="learning-progress-title" className="font-heading text-2xl font-semibold">{t("title")}</h2>
      {result.ok ? <ProgressPanel studentId={studentId} classId={classId} initial={result.data} /> : <ProgressLoadError />}
    </section>
  );
}
