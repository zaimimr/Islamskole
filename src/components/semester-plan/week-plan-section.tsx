import { getTranslations } from "next-intl/server";
import { WeekPlanEditor } from "@/components/semester-plan/week-plan-editor";
import { ReuseTeachingPlan } from "@/components/semester-plan/reuse-teaching-plan";
import { createClient } from "@/lib/supabase/server";
import { osloToday } from "@/lib/dates";
import type { SlotRange, TimeSlot } from "@/lib/lessons";
import { getSchoolDays } from "@/lib/portal/data";
import { allSchoolDays } from "@/lib/portal/teacher-days";
import { getWeekPlans } from "@/lib/portal/week-plan-data";
import { planWeeks } from "@/lib/semester-plan";
import { cn } from "@/lib/utils";

export async function WeekPlanSection({
  classId,
  schoolYearId,
  slots,
  blocks,
  locale,
  admin = false,
}: {
  classId: string;
  schoolYearId: string;
  slots: TimeSlot[];
  blocks: (SlotRange & { subject: string | null })[];
  locale: string;
  admin?: boolean;
}) {
  const [t, entries, days] = await Promise.all([
    getTranslations({ locale, namespace: "portal.semesterPlan" }),
    getWeekPlans(classId, schoolYearId),
    getSchoolDays(schoolYearId),
  ]);
  const supabase = await createClient();
  const { data: previous } = await supabase.rpc("teaching_previous_years", { p_class_id: classId, p_school_year_id: schoolYearId });

  return (
    <section
      aria-labelledby="semester-plan-title"
      className={cn(
        "grid gap-4",
        admin && "rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3] sm:p-5 print:hidden",
      )}
    >
      <div className="grid gap-1">
        <h2 id="semester-plan-title" className={cn("font-bold", admin ? "font-heading text-xl" : "text-2xl")}>
          {t("title")}
        </h2>
        <p className={cn("max-w-2xl text-sm", admin ? "text-admin-muted" : "text-muted-foreground")}>
          {t("introEdit")}
        </p>
      </div>
      <ReuseTeachingPlan classId={classId} schoolYearId={schoolYearId} years={previous ?? []} />
      <WeekPlanEditor
        classId={classId}
        schoolYearId={schoolYearId}
        weeks={planWeeks(allSchoolDays(days), entries)}
        entries={entries}
        slots={slots}
        blocks={blocks.map((block) => ({
          start_position: block.start_position,
          end_position: block.end_position,
          subject: block.subject,
        }))}
        today={osloToday()}
      />
    </section>
  );
}
