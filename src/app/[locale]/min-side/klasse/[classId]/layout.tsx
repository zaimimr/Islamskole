import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import {
  getClassForAdmin,
  getClassForLessonTeacher,
  getMyClasses,
  getPortalContext,
} from "@/lib/portal/data";

export default async function TeacherClassAccessLayout({
  children,
  params,
}: LayoutProps<"/[locale]/min-side/klasse/[classId]">) {
  const { locale, classId } = await params;
  const [context, classes] = await Promise.all([getPortalContext(), getMyClasses()]);
  if (!context.user) redirect({ href: "/min-side/logg-inn", locale });

  const allowed =
    classes.some((row) => row.class_id === classId) ||
    (await getClassForLessonTeacher(classId)) !== null ||
    (context.isAdmin && (await getClassForAdmin(classId)) !== null);
  if (!allowed) notFound();

  return children;
}
