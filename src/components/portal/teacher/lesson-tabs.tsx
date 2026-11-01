import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type LessonTab = {
  id: string;
  title: string;
  times: string;
  teacher: string | null;
  isSubstitute: boolean;
  cancelled: boolean;
  isMine: boolean;
  note: string | null;
};

export async function LessonTabs({
  classId,
  dayId,
  selectedId,
  lessons,
}: {
  classId: string;
  dayId: string;
  selectedId: string;
  lessons: LessonTab[];
}) {
  const t = await getTranslations("portal.teacher.lessons");
  return (
    <nav aria-label={t("title")} className="min-w-0 flex-1 overflow-x-auto">
      <ul className="flex gap-1.5 p-0.5">
        {lessons.map((lesson) => (
          <li key={lesson.id} className="shrink-0">
            <Link
              href={`/min-side/klasse/${classId}?dag=${dayId}&time=${lesson.id}`}
              scroll={false}
              aria-current={lesson.id === selectedId ? "page" : undefined}
              className={cn(
                "grid min-h-11 content-center rounded-lg bg-card px-3 py-1 text-left leading-tight ring-1 ring-foreground/10 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                "aria-[current=page]:bg-primary/10 aria-[current=page]:ring-2 aria-[current=page]:ring-brand-green-dark",
                lesson.cancelled && "opacity-70",
              )}
            >
              <span className={cn("flex items-center gap-1.5 text-sm font-semibold", lesson.cancelled && "line-through")}>
                {lesson.title}
                {lesson.isMine ? (
                  <>
                    <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-brand-green-dark" />
                    <span className="sr-only">{t("mine")}</span>
                  </>
                ) : null}
              </span>
              {lesson.times ? <span className="text-xs text-muted-foreground tabular-nums">{lesson.times}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export async function LessonDetails({ lesson }: { lesson: LessonTab }) {
  const t = await getTranslations("portal.teacher.lessons");
  if (!lesson.teacher && !lesson.isSubstitute && !lesson.isMine && !lesson.cancelled && !lesson.note) return null;
  return (
    <div className="grid gap-1 text-sm">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
        {lesson.teacher ? <span>{lesson.teacher}</span> : null}
        {lesson.isSubstitute ? (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
            {t("substitute")}
          </span>
        ) : null}
        {lesson.isMine ? (
          <span className="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-semibold text-brand-green-dark">
            {t("mine")}
          </span>
        ) : null}
        {lesson.cancelled ? (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
            {t("cancelled")}
          </span>
        ) : null}
      </p>
      {lesson.note ? <p className="text-pretty text-foreground/80">{lesson.note}</p> : null}
    </div>
  );
}
