import { setRequestLocale } from "next-intl/server";
import { TeacherSuspendedNotice } from "@/components/portal/teacher/suspended-notice";
import { getIsAdmin } from "@/lib/auth";
import { isSuspendedTeacher } from "@/lib/portal/data";

export default async function TeacherClassLayout({
  children,
  params,
}: LayoutProps<"/[locale]/min-side/klasse">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [isAdmin, suspended] = await Promise.all([getIsAdmin(), isSuspendedTeacher()]);

  if (suspended && !isAdmin) return <TeacherSuspendedNotice showHomeLink />;
  return children;
}
