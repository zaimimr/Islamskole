import { ClassFollowUps } from "@/components/attendance-followup/class-followups";
import { ClassHomework } from "@/components/portal/teacher/class-homework";
import { createClient } from "@/lib/supabase/server";
import { HandoverEditor } from "@/components/portal/teacher/handover-editor";
import { LessonPreparation } from "@/components/portal/teacher/lesson-preparation";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, CalendarX, Info, UserRoundCheck } from "lucide-react";
import { adminBasePath } from "@/components/admin/paths";
import { Link, redirect } from "@/i18n/navigation";
import { AttendanceRoster } from "@/components/portal/teacher/attendance-roster";
import { ClassNoteEditor } from "@/components/portal/teacher/class-note-editor";
import { DaySwitcher } from "@/components/portal/teacher/day-switcher";
import { EndSubstituteButton } from "@/components/portal/teacher/end-substitute-button";
import { LessonTabs } from "@/components/portal/teacher/lesson-tabs";
import { WeekPlanSection } from "@/components/semester-plan/week-plan-section";
import { WeekPlanView } from "@/components/semester-plan/week-plan-view";
import { osloToday } from "@/lib/dates";
import { lessonTitle } from "@/lib/lessons";
import {
  getClassForAdmin,
  getClassForLessonTeacher,
  getClassNotes,
  getLessonRoster,
  getLessons,
  getMyClasses,
  getPortalContext,
  getSchoolDays,
  getTimeSlots,
} from "@/lib/portal/data";
import { lessonView } from "@/lib/portal/lesson-view";
import {
  allSchoolDays,
  capitalize,
  defaultSchoolDay,
  formatSavedAt,
  formatSchoolDay,
} from "@/lib/portal/teacher-days";
import { getLessonNote } from "@/lib/portal/teacher-notes";
import { getClassBlocks, getWeekPlans } from "@/lib/portal/week-plan-data";
import { ClassProgress } from "@/components/learning-progress/class-progress";

const backLinkClass =
  "inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg pr-2 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function TeacherClassPage({
  params,
  searchParams,
}: PageProps<"/[locale]/min-side/klasse/[classId]">) {
  const { locale, classId } = await params;
  setRequestLocale(locale);
  const [context, query, classes, t] = await Promise.all([
    getPortalContext(),
    searchParams,
    getMyClasses(),
    getTranslations("portal.teacher"),
  ]);
  if (!context.user) redirect({ href: "/min-side/logg-inn", locale });

  const lessonAccess = classes.some((row) => row.class_id === classId)
    ? null
    : await getClassForLessonTeacher(classId);
  const current =
    classes.find((row) => row.class_id === classId) ??
    lessonAccess?.portalClass ??
    (context.isAdmin ? await getClassForAdmin(classId) : null);
  if (!current) notFound();

  const [days, slots] = await Promise.all([
    getSchoolDays(current.school_year_id),
    getTimeSlots(current.school_year_id),
  ]);
  const scoped = lessonAccess
    ? {
        ...days,
        upcoming: days.upcoming.filter((item) => lessonAccess.dayIds.has(item.id)),
        past: days.past.filter((item) => lessonAccess.dayIds.has(item.id)),
      }
    : days;
  const list = allSchoolDays(scoped);
  const requested = typeof query.dag === "string" ? list.find((day) => day.id === query.dag) : undefined;
  const day = requested ?? defaultSchoolDay(scoped);
  const today = osloToday();
  const className = locale === "en" ? current.name_en : current.name_no;
  const wholeDay = t("lessons.wholeDay");

  const lessons = day ? (await getLessons([day.id])).filter((row) => row.class_id === classId) : [];
  const lesson =
    lessons.find((row) => row.lesson_id === query.time) ??
    lessons.find((row) => row.is_mine && !row.cancelled) ??
    lessons.find((row) => !row.cancelled) ??
    lessons[0] ??
    null;

  const [roster, note, notes, blocks, weekPlans] = await Promise.all([
    lesson ? getLessonRoster(lesson.lesson_id, current.school_year_label) : Promise.resolve([]),
    lesson ? getLessonNote(lesson.lesson_id) : Promise.resolve(null),
    getClassNotes(classId, 12, day?.date ?? today),
    lessonAccess ? Promise.resolve([]) : getClassBlocks(classId, current.school_year_id),
    getWeekPlans(classId, current.school_year_id),
  ]);
  const { data: handover } = lesson
    ? await (await createClient()).from("lesson_handovers").select("instructions").eq("lesson_id", lesson.lesson_id).maybeSingle()
    : { data: null };
  const previousNotes = notes
    .filter((row) => !day || (row.date !== null && row.date < day.date))
    .slice(0, 5);
  const isFuture = day ? day.date > today : false;
  const reportable = day && lesson ? !day.cancelled && !lesson.cancelled : false;
  const markable = reportable && !isFuture;
  const showTabs = lessons.some((row) => lessonTitle(row, slots, wholeDay) !== wholeDay);
  const noteLesson = (row: (typeof previousNotes)[number]) =>
    row.start_position !== null && row.end_position !== null
      ? lessonTitle({ start_position: row.start_position, end_position: row.end_position, subject: row.subject }, slots, wholeDay)
      : wholeDay;

  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        {current.role === "admin" ? (
          <NextLink
            href={`${adminBasePath(locale)}/klasser/${classId}`}
            className={backLinkClass}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {t("backToAdmin")}
          </NextLink>
        ) : (
          <Link
            href={context.isGuardian ? "/min-side?fane=klasse" : "/min-side"}
            className={backLinkClass}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {t("back")}
          </Link>
        )}
        <div className="grid gap-1">
          <h1 className="text-3xl font-bold text-balance">{className}</h1>
          <p className="text-muted-foreground">
            {t("students", { count: current.student_count || roster.length })} · {current.school_year_label}
          </p>
        </div>
        {current.substitute_until ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-secondary p-3 text-sm text-secondary-foreground">
            <p className="flex min-w-0 flex-1 gap-2">
              <UserRoundCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t("substitute.notice", { date: formatSchoolDay(current.substitute_until, locale) })}
            </p>
            <EndSubstituteButton classId={classId} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="grid gap-8">
          {day ? (
            <>
              <div className="grid gap-3">
                <DaySwitcher
                  classId={classId}
                  selectedId={day.id}
                  days={list.map((item) => ({
                    id: item.id,
                    label: capitalize(
                      formatSchoolDay(item.date, locale, { weekday: "short", day: "numeric", month: "short" }),
                    ),
                    cancelled: item.cancelled,
                    isToday: item.date === today,
                  }))}
                />
                {day.cancelled ? (
                  <p role="status" className="flex gap-2 rounded-xl bg-secondary p-3 text-sm text-secondary-foreground">
                    <CalendarX aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    <span>
                      <span className="font-semibold">{t("day.cancelledNotice")}</span>
                      {day.note ? ` ${day.note}` : null}
                    </span>
                  </p>
                ) : isFuture ? (
                  <p role="status" className="flex gap-2 rounded-xl bg-muted p-3 text-sm">
                    <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    {t("day.futureNotice")}
                  </p>
                ) : null}
              </div>

              {showTabs ? (
                <LessonTabs
                  classId={classId}
                  dayId={day.id}
                  selectedId={lesson?.lesson_id ?? ""}
                  lessons={lessons.map((row) => lessonView(row, slots, wholeDay, locale))}
                />
              ) : null}

              {lesson?.cancelled && !day.cancelled ? (
                <p role="status" className="flex gap-2 rounded-xl bg-secondary p-3 text-sm text-secondary-foreground">
                  <CalendarX aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span className="font-semibold">{t("lessons.cancelledNotice")}</span>
                </p>
              ) : null}

              {lesson ? <LessonPreparation classId={classId} schoolYearId={current.school_year_id}
                lessonId={lesson.lesson_id} date={day.date} startPosition={lesson.start_position} endPosition={lesson.end_position}
                entries={weekPlans} slots={slots} locale={locale} /> : null}

              {lesson ? (
                <section aria-labelledby="attendance-title" className="grid gap-3">
                  <h2 id="attendance-title" className="text-2xl font-bold">
                    {t("roster.title")}
                  </h2>
                  <AttendanceRoster
                    key={lesson.lesson_id}
                    rows={roster}
                    lessonId={lesson.lesson_id}
                    markable={markable}
                    reportable={reportable}
                  />
                </section>
              ) : (
                <p className="rounded-2xl bg-card p-5 text-muted-foreground ring-1 ring-foreground/8">{t("lessons.none")}</p>
              )}
            </>
          ) : (
            <p className="rounded-2xl bg-card p-5 text-muted-foreground ring-1 ring-foreground/8">{t("noDays")}</p>
          )}
          <ClassFollowUps classId={classId} yearId={current.school_year_id} locale={locale} />
          <ClassHomework classId={classId} schoolYearId={current.school_year_id}
            selectedId={typeof query.lekse === "string" ? query.lekse : undefined} locale={locale} />
          <ClassProgress classId={classId} />
        </div>

        <aside className="grid gap-8 lg:sticky lg:top-24">
          {lesson ? <section className="grid gap-3">
            <h2 className="text-2xl font-bold">{locale === "en" ? "Substitute handover" : "Vikaroverlevering"}</h2>
            <HandoverEditor key={lesson.lesson_id} lessonId={lesson.lesson_id} instructions={handover?.instructions ?? ""} />
          </section> : null}
          {day && lesson ? (
            <section aria-labelledby="note-title" className="grid gap-3">
              <div className="grid gap-1">
                <h2 id="note-title" className="text-2xl font-bold">
                  {t("note.title")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {lessonTitle(lesson, slots, wholeDay)} · {t("note.intro")}
                </p>
              </div>
              <ClassNoteEditor
                key={lesson.lesson_id}
                lessonId={lesson.lesson_id}
                initialHomework={note?.homework ?? ""}
                initialSummary={note?.summary ?? ""}
                savedLabel={note?.updated_at ? formatSavedAt(note.updated_at, locale) : null}
                disabled={day.cancelled || lesson.cancelled}
              />
            </section>
          ) : null}

          <section aria-labelledby="previous-notes-title" className="grid gap-3">
            <h2 id="previous-notes-title" className="text-xl font-bold">
              {t("previous.title")}
            </h2>
            {previousNotes.length ? (
              <ul className="divide-y divide-foreground/8 overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/8">
                {previousNotes.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/min-side/klasse/${classId}?dag=${row.school_day_id}&time=${row.lesson_id}`}
                      className="grid gap-2 p-4 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                    >
                      <p className="font-semibold">
                        {row.date ? capitalize(formatSchoolDay(row.date, locale)) : null}
                        {noteLesson(row) !== wholeDay ? (
                          <span className="font-normal text-muted-foreground"> · {noteLesson(row)}</span>
                        ) : null}
                      </p>
                      {row.homework ? (
                        <p className="text-sm">
                          <span className="font-semibold">{t("note.homework")}: </span>
                          <span className="whitespace-pre-line">{row.homework}</span>
                        </p>
                      ) : null}
                      {row.summary ? (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-semibold text-foreground">{t("note.summary")}: </span>
                          <span className="whitespace-pre-line">{row.summary}</span>
                        </p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("previous.empty")}</p>
            )}
          </section>
        </aside>
      </div>

      {lessonAccess ? (
        <WeekPlanView
          id="semester-plan-title"
          entries={weekPlans}
          days={allSchoolDays(days)}
          slots={slots}
          locale={locale}
          today={today}
        />
      ) : (
        <WeekPlanSection
          classId={classId}
          schoolYearId={current.school_year_id}
          slots={slots}
          blocks={blocks}
          locale={locale}
        />
      )}
    </div>
  );
}
