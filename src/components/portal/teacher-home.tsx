import { getTranslations } from "next-intl/server";
import { CalendarDays, ChevronRight, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { osloToday } from "@/lib/dates";
import {
  getClassRoster,
  getLessons,
  getMyClasses,
  getMyTeacherAbsences,
  getSchoolDays,
  getSubstituteOptions,
  getTimeSlots,
} from "@/lib/portal/data";
import { lessonView } from "@/lib/portal/lesson-view";
import { capitalize, defaultSchoolDay, formatSchoolDay } from "@/lib/portal/teacher-days";
import { SubstitutePicker } from "@/components/portal/teacher/substitute-picker";
import { TeacherAbsence } from "@/components/portal/teacher/teacher-absence";

export async function TeacherHome({ locale }: { locale: string }) {
  const [t, tHome, classes, substituteOptions, myAbsences] = await Promise.all([
    getTranslations({ locale, namespace: "portal.teacher" }),
    getTranslations({ locale, namespace: "portal.home" }),
    getMyClasses(),
    getSubstituteOptions(),
    getMyTeacherAbsences(),
  ]);
  const days = await getSchoolDays(classes[0]?.school_year_id);
  const nextDay = defaultSchoolDay({ ...days, past: [] });
  const [rosters, lessons, slots] = await Promise.all([
    nextDay
      ? Promise.all(classes.map((row) => getClassRoster(row.class_id, nextDay.id)))
      : Promise.resolve(classes.map(() => [])),
    nextDay ? getLessons([nextDay.id]) : Promise.resolve([]),
    days.schoolYearId ? getTimeSlots(days.schoolYearId) : Promise.resolve([]),
  ]);
  const today = osloToday();
  const wholeDay = t("lessons.wholeDay");
  const classIds = new Set(classes.map((row) => row.class_id));
  const extraLessons = lessons.filter((lesson) => lesson.is_mine && !classIds.has(lesson.class_id));
  const reportedDays = new Set(myAbsences.map((absence) => absence.school_day_id));
  const dayLabel = (date: string) => formatSchoolDay(date, locale, { weekday: "long", day: "numeric", month: "long" });

  return (
    <section aria-labelledby="teacher-home-title" className="grid gap-3">
      <h2 id="teacher-home-title" className="text-2xl font-bold">
        {tHome("teacherTitle")}
      </h2>
      {classes.length === 0 ? (
        <p className="text-pretty text-muted-foreground">{tHome("teacherUnassigned")}</p>
      ) : null}
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {classes.map((row, index) => {
          const reported = rosters[index].filter((student) => student.absence_report_id).length;
          return (
            <li key={row.class_id}>
              <Link
                href={`/min-side/klasse/${row.class_id}`}
                className="group grid gap-3 rounded-2xl bg-card p-5 ring-1 ring-foreground/8 outline-none transition-shadow hover:ring-foreground/20 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex items-start gap-3">
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <p className="flex flex-wrap items-center gap-2 font-heading text-xl font-semibold">
                      {locale === "en" ? row.name_en : row.name_no}
                      {row.substitute_until ? (
                        <span className="rounded-full bg-secondary px-2.5 py-0.5 font-sans text-xs font-semibold text-secondary-foreground">
                          {t("substitute.badge", { date: formatSchoolDay(row.substitute_until, locale) })}
                        </span>
                      ) : null}
                    </p>
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users aria-hidden="true" className="size-4 shrink-0" />
                      {t("students", { count: row.student_count })}
                      <span aria-hidden="true">·</span>
                      {row.school_year_label}
                    </p>
                  </div>
                  <span className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-brand-green-dark">
                    {t("open")}
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-muted px-3 py-2.5 text-sm">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
                    {nextDay
                      ? nextDay.date === today
                        ? t("todayWithDate", { date: formatSchoolDay(nextDay.date, locale) })
                        : capitalize(formatSchoolDay(nextDay.date, locale))
                      : t("noDays")}
                    {nextDay?.cancelled ? ` (${t("day.cancelled")})` : null}
                  </span>
                  {nextDay ? (
                    <span className={reported ? "font-semibold text-accent-foreground" : "text-muted-foreground"}>
                      {t("reportedCount", { count: reported })}
                    </span>
                  ) : null}
                </div>
                <LessonList
                  lessons={lessons
                    .filter((lesson) => lesson.class_id === row.class_id)
                    .map((lesson) => lessonView(lesson, slots, wholeDay, locale))}
                  labels={{ substitute: t("lessons.substitute"), mine: t("lessons.mine"), cancelled: t("lessons.cancelled") }}
                />
              </Link>
            </li>
          );
        })}
      </ul>
      {nextDay && extraLessons.length ? (
        <div className="grid gap-3">
          <h3 className="text-xl font-bold">{t("lessons.extraTitle")}</h3>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {extraLessons.map((lesson) => {
              const view = lessonView(lesson, slots, wholeDay, locale);
              return (
                <li key={lesson.lesson_id}>
                  <Link
                    href={`/min-side/klasse/${lesson.class_id}?dag=${lesson.school_day_id}&time=${lesson.lesson_id}`}
                    className="group grid gap-1 rounded-2xl bg-card p-5 ring-1 ring-foreground/8 outline-none transition-shadow hover:ring-foreground/20 focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="font-heading text-xl font-semibold">
                      {locale === "en" ? lesson.class_name_en : lesson.class_name_no}
                    </span>
                    <span className="font-semibold">{view.title}</span>
                    <span className="text-sm text-muted-foreground">
                      {capitalize(formatSchoolDay(lesson.date, locale))}
                      {view.times ? ` · ${view.times}` : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {classes.length ? (
        <TeacherAbsence
          days={days.upcoming
            .filter((day) => !day.cancelled)
            .slice(0, 8)
            .map((day) => ({ id: day.id, label: dayLabel(day.date), reported: reportedDays.has(day.id) }))}
          absences={myAbsences.map((absence) => ({
            id: absence.id,
            label: dayLabel(absence.date),
            reason: absence.reason,
            byAdmin: absence.source === "admin",
            canUndo: absence.source === "laerer",
          }))}
        />
      ) : null}
      {substituteOptions.length ? (
        <SubstitutePicker
          options={substituteOptions.map((option) => ({
            value: option.class_id,
            label: `${locale === "en" ? option.name_en : option.name_no} (${t("students", { count: option.student_count })})`,
          }))}
        />
      ) : null}
    </section>
  );
}

function LessonList({
  lessons,
  labels,
}: {
  lessons: ReturnType<typeof lessonView>[];
  labels: { substitute: string; mine: string; cancelled: string };
}) {
  if (!lessons.length) return null;
  return (
    <ul className="grid gap-1 text-sm">
      {lessons.map((lesson) => (
        <li key={lesson.id} className="flex flex-wrap items-baseline gap-x-2">
          <span className={lesson.cancelled ? "font-semibold line-through" : "font-semibold"}>{lesson.title}</span>
          {lesson.times ? <span className="text-muted-foreground tabular-nums">{lesson.times}</span> : null}
          {lesson.teacher ? <span className="text-muted-foreground">{lesson.teacher}</span> : null}
          {lesson.isSubstitute ? <span className="font-semibold text-secondary-foreground">{labels.substitute}</span> : null}
          {lesson.isMine ? <span className="font-semibold text-brand-green-dark">{labels.mine}</span> : null}
          {lesson.cancelled ? <span className="font-semibold text-destructive">{labels.cancelled}</span> : null}
          {lesson.note ? <span className="basis-full text-pretty text-foreground/80">{lesson.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}
