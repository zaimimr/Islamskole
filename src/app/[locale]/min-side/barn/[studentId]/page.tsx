import { StudentReports } from "@/components/term-reports/student-reports";
import { StudentHomework } from "@/components/portal/student-homework";
import { LessonMaterials } from "@/components/portal/lesson-materials";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft, Pencil } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { ChildAbsence } from "@/components/portal/parent/child-absence";
import { childName, joinNames, noteLessonLabel } from "@/components/portal/parent/child-card";
import { ChildLessons } from "@/components/portal/parent/child-lessons";
import { WeekPlanView } from "@/components/semester-plan/week-plan-view";
import { statusByDay } from "@/lib/lessons";
import { formatPortalDay } from "@/lib/portal/parent-format";
import { AttendanceYear, NotesYear } from "@/components/portal/year-overview";
import { getPortalContext } from "@/lib/portal/data";
import { absenceOptions, getParentData } from "@/lib/portal/parent-data";
import { currentTerm, summarizeAttendance } from "@/lib/portal/parent-format";
import { allSchoolDays } from "@/lib/portal/teacher-days";
import { getWeekPlans } from "@/lib/portal/week-plan-data";
import { LearningProgressSection } from "@/components/learning-progress/progress-section";

export default async function ChildDetailPage({
  params,
}: PageProps<"/[locale]/min-side/barn/[studentId]">) {
  const { locale, studentId } = await params;
  setRequestLocale(locale);
  const context = await getPortalContext();
  if (!context.user) redirect({ href: "/min-side/logg-inn", locale });

  const [t, data] = await Promise.all([
    getTranslations({ locale, namespace: "portal.parent" }),
    getParentData(500),
  ]);
  const child = data.children.find((row) => row.student_id === studentId);
  if (!child) notFound();

  const name = childName(child);
  const className = locale === "en" ? child.class_name_en : child.class_name_no;
  const teachers = joinNames(child.teachers, locale);
  const { term, from, to } = currentTerm(data.today);
  const summary = summarizeAttendance(data.attendance, child.student_id, { from, to }, data.today);
  const options = absenceOptions(child, data.schoolDays.upcoming, data.reports, locale, data.today);
  const childAttendance = data.attendance.filter((row) => row.student_id === child.student_id);
  const statusByDate = statusByDay(childAttendance);
  const yearDays = allSchoolDays(data.schoolDays).filter((day) => !day.cancelled);
  const dayLessons = data.lessons.filter((lesson) => lesson.class_id === child.class_id);
  const classNotes = data.notesByClass.get(child.class_id) ?? [];
  const weekPlans = await getWeekPlans(child.class_id, child.school_year_id);

  return (
    <div className="grid gap-8">
      <Link
        href="/min-side"
        className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 font-semibold text-brand-green-dark outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
        {t("back")}
      </Link>

      <header className="grid gap-1">
        <h1 className="font-heading text-3xl font-semibold text-balance">{name}</h1>
        <p className="font-semibold text-brand-green-dark">
          {className}
          {child.age != null ? <span className="font-normal text-foreground/75"> · {t("age", { age: child.age })}</span> : null}
        </p>
        <p className="text-sm text-foreground/75">
          {teachers ? t("teachers", { names: teachers, count: child.teachers.length }) : t("noTeacher")}
        </p>
        <Link
          href={`/min-side/familie#child-${child.student_id}`}
          className="-ml-2 inline-flex min-h-11 w-fit items-center gap-2 rounded-lg px-2 text-sm font-semibold text-brand-green-dark outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Pencil aria-hidden="true" className="size-4" />
          {t("editInfo")}
        </Link>
      </header>

      {data.openDay && dayLessons.length ? (
        <section aria-labelledby="detail-lessons" className="soft-card grid gap-3 p-5 sm:p-6">
          <h2 id="detail-lessons" className="font-heading text-xl font-semibold first-letter:uppercase">
            {t("lessons.title", { day: formatPortalDay(data.openDay.date, locale) })}
          </h2>
          <ChildLessons
            lessons={dayLessons}
            slots={data.slots}
            locale={locale}
            statusByLesson={new Map(
              childAttendance
                .filter((row) => row.lesson_id)
                .map((row) => [row.lesson_id as string, row.status]),
            )}
          />
        </section>
      ) : null}

      <StudentHomework studentId={child.student_id} locale={locale} />
      <LearningProgressSection studentId={child.student_id} />
      <StudentReports studentId={child.student_id} locale={locale} />
      <LessonMaterials classId={child.class_id} schoolYearId={child.school_year_id} locale={locale} />

      <WeekPlanView
        id="detail-semester-plan"
        entries={weekPlans}
        days={allSchoolDays(data.schoolDays)}
        slots={data.slots}
        locale={locale}
        today={data.today}
      />

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <AttendanceYear
          id="detail-absence"
          title={t("attendance.title")}
          historyTitle={t("attendance.historyTitle")}
          days={yearDays}
          statusByDate={statusByDate}
          statusLabel={(status) => t(`status.${status}`)}
          locale={locale}
        >
          <p className="text-pretty">
            {summary.absent
              ? t("attendance.absent", { count: summary.absent, term: t(`term.${term}`) })
              : t("attendance.none", { term: t(`term.${term}`) })}
            {summary.late ? ` ${t("attendance.late", { count: summary.late })}` : null}
          </p>
          <ChildAbsence
            studentId={child.student_id}
            classId={child.class_id}
            childName={child.first_name ?? name}
            days={options.days}
            reports={options.reports}
          />
        </AttendanceYear>

        <NotesYear
          id="detail-notes"
          title={t("note.yearTitle")}
          empty={t("note.empty")}
          notes={classNotes.map((row) => ({ ...row, lessonLabel: noteLessonLabel(row, data.slots, t("lessons.wholeDay")) }))}
          labels={{ homework: t("note.homework"), summary: t("note.summary") }}
          locale={locale}
        />
      </div>
    </div>
  );
}
