import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { getClassForAdmin, getClassForLessonTeacher, getMyClasses, getPortalContext } from "@/lib/portal/data";
import { getLearningClassStudents } from "@/lib/learning-progress/data";
import { LearningProgressSection } from "@/components/learning-progress/progress-section";

export default async function StudentProgressPage({ params }: PageProps<"/[locale]/min-side/klasse/[classId]/elev/[studentId]">) {
  const { locale, classId, studentId } = await params;
  setRequestLocale(locale);
  const [context, t] = await Promise.all([getPortalContext(), getTranslations("learningProgress")]);
  if (!context.user) redirect({ href: `/min-side/logg-inn?next=${encodeURIComponent(`/min-side/klasse/${classId}/elev/${studentId}`)}`, locale });
  const [result, classes] = await Promise.all([getLearningClassStudents(classId), getMyClasses()]);
  if (!result.ok) throw new Error("Learning roster unavailable");
  const student = result.data.find((row) => row.student_id === studentId);
  if (!student) notFound();
  const current = classes.find((row) => row.class_id === classId)
    ?? (context.isAdmin ? await getClassForAdmin(classId) : (await getClassForLessonTeacher(classId))?.portalClass);
  return (
    <div className="grid gap-8">
      <Link href={`/min-side/klasse/${classId}`} className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 font-semibold text-brand-green-dark outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"><ChevronLeft aria-hidden="true" className="size-5" />{t("backToClass")}</Link>
      <header className="grid gap-1">
        <h1 className="font-heading text-3xl font-semibold wrap-anywhere">{[student.first_name, student.last_name].filter(Boolean).join(" ")}</h1>
        {current ? <p className="font-semibold text-brand-green-dark">{locale === "en" ? current.name_en : current.name_no}</p> : null}
      </header>
      <LearningProgressSection studentId={studentId} classId={classId} />
    </div>
  );
}
