import { getTranslations } from "next-intl/server";
import { joinNames, noteLessonLabel } from "@/components/portal/parent/child-card";
import { ChildLessons } from "@/components/portal/parent/child-lessons";
import { AttendanceYear, NotesYear } from "@/components/portal/year-overview";
import { WeekPlanView } from "@/components/semester-plan/week-plan-view";
import { osloToday } from "@/lib/dates";
import { statusByDay } from "@/lib/lessons";
import { getLessons, getMySelf, getSchoolDays, getTimeSlots } from "@/lib/portal/data";
import { formatPortalDay } from "@/lib/portal/parent-format";
import { allSchoolDays } from "@/lib/portal/teacher-days";
import { getWeekPlans } from "@/lib/portal/week-plan-data";
import { LearningProgressSection } from "@/components/learning-progress/progress-section";

export async function StudentHome({ locale }: { locale: string }) {
  const [t, tParent, self] = await Promise.all([
    getTranslations({ locale, namespace: "portal.student" }),
    getTranslations({ locale, namespace: "portal.parent" }),
    getMySelf(),
  ]);
  const me = self.find((row) => row.class_id) ?? self[0];
  const [days, slots, weekPlans] = me?.school_year_id
    ? await Promise.all([
        getSchoolDays(me.school_year_id),
        getTimeSlots(me.school_year_id),
        me.class_id ? getWeekPlans(me.class_id, me.school_year_id) : Promise.resolve([]),
      ])
    : [null, [], []];
  const openDay = days?.upcoming.find((day) => !day.cancelled) ?? null;
  const lessons = openDay && me?.class_id
    ? (await getLessons([openDay.id])).filter((lesson) => lesson.class_id === me.class_id)
    : [];
  const today = osloToday();
  const className = me ? (locale === "en" ? me.class_name_en : me.class_name_no) : null;
  const teachers = me ? joinNames(me.teachers, locale) : "";

  return (
    <section aria-labelledby="student-home-title" className="grid gap-6">
      <header className="grid gap-1">
        <h2 id="student-home-title" className="font-heading text-3xl font-semibold text-balance">
          {t("title")}
        </h2>
        {className ? (
          <p className="font-semibold text-brand-green-dark">
            {className}
            {me?.school_year_label ? (
              <span className="font-normal text-foreground/75"> · {me.school_year_label}</span>
            ) : null}
          </p>
        ) : (
          <p className="text-muted-foreground">{t("noClass")}</p>
        )}
        {className ? (
          <p className="text-sm text-foreground/75">
            {teachers
              ? tParent("teachers", { names: teachers, count: me?.teachers.length ?? 0 })
              : tParent("noTeacher")}
          </p>
        ) : null}
      </header>

      {me ? <LearningProgressSection studentId={me.student_id} /> : null}

      {me && className ? (
        <>
          {openDay && lessons.length ? (
            <section aria-labelledby="student-lessons" className="soft-card grid gap-3 p-5 sm:p-6">
              <h3 id="student-lessons" className="font-heading text-xl font-semibold first-letter:uppercase">
                {tParent("lessons.title", { day: formatPortalDay(openDay.date, locale) })}
              </h3>
              <ChildLessons lessons={lessons} slots={slots} locale={locale} />
            </section>
          ) : null}
          <WeekPlanView
            id="student-semester-plan"
            entries={weekPlans}
            days={days ? allSchoolDays(days) : []}
            slots={slots}
            locale={locale}
            today={today}
          />
          <NotesYear
            id="student-notes"
            title={tParent("note.yearTitle")}
            empty={tParent("note.empty")}
            notes={me.notes
              .filter((note) => note.date <= today)
              .map((note) => ({ ...note, lessonLabel: noteLessonLabel(note, slots, tParent("lessons.wholeDay")) }))}
            labels={{ homework: tParent("note.homework"), summary: tParent("note.summary") }}
            locale={locale}
          />
          <AttendanceYear
            id="student-attendance"
            title={tParent("attendance.title")}
            historyTitle={tParent("attendance.historyTitle")}
            days={days ? allSchoolDays(days).filter((day) => !day.cancelled) : []}
            statusByDate={statusByDay(me.attendance)}
            statusLabel={(status) => tParent(`status.${status}`)}
            locale={locale}
          />
        </>
      ) : null}
    </section>
  );
}
