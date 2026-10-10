import { createClient } from "@/lib/supabase/server";
import { ExternalLink, FileDown } from "lucide-react";
import { getLessonMaterials } from "@/lib/portal/materials";
import { MaterialEditor, RemoveMaterialButton } from "@/components/portal/material-editor";

export async function LessonMaterials({ classId, schoolYearId, lessonId, locale, editable = false }: {
  classId: string; schoolYearId: string; lessonId?: string; locale: string; editable?: boolean;
}) {
  const materials = await getLessonMaterials(classId, schoolYearId, lessonId, editable);
  if (!editable && !materials.length) return null;
  const en = locale === "en";
  const supabase = await createClient();
  const scope = { p_class_id: classId, p_school_year_id: schoolYearId };
  const [{ data: canManageClass }, { data: canManageLesson }] = editable ? await Promise.all([
    supabase.rpc("can_manage_lesson_material", { ...scope, p_lesson_id: null }),
    lessonId ? supabase.rpc("can_manage_lesson_material", { ...scope, p_lesson_id: lessonId }) : Promise.resolve({ data: false }),
  ]) : [{ data: false }, { data: false }];
  const canAdd = canManageClass || canManageLesson;
  return (
    <section aria-label={en ? "Lesson materials" : "Undervisningsmateriell"} className="grid gap-3">
      <h2 className="font-heading text-xl font-semibold">{en ? "Lesson materials" : "Undervisningsmateriell"}</h2>
      {materials.length ? <ul className="divide-y divide-foreground/8 rounded-2xl bg-card ring-1 ring-foreground/8">
        {materials.map((material) => (
          <li key={material.id} className="flex items-center gap-2 p-3">
            {material.status === "ready" ? <a href={material.kind === "link" ? material.url! : `/api/lesson-materials/${material.id}`}
              target={material.kind === "link" ? "_blank" : undefined} rel={material.kind === "link" ? "noopener noreferrer" : undefined}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-1 font-semibold text-brand-green-dark underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
              {material.kind === "link" ? <ExternalLink aria-hidden="true" className="size-4 shrink-0" /> : <FileDown aria-hidden="true" className="size-4 shrink-0" />}
              <span className="min-w-0 break-words">{material.title}</span>
            </a> : <p className="min-w-0 flex-1 break-words text-sm">{material.title} · {en ? "Upload incomplete" : "Opplasting ikke fullført"}</p>}
            {canManageClass || (canManageLesson && material.lesson_id === lessonId) ? <RemoveMaterialButton id={material.id} title={material.title} /> : null}
          </li>
        ))}
      </ul> : null}
      {canAdd ? <MaterialEditor classId={classId} schoolYearId={schoolYearId} lessonId={lessonId ?? null} /> : null}
    </section>
  );
}
