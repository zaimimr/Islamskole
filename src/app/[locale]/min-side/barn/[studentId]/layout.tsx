import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { getMyChildren, getPortalContext } from "@/lib/portal/data";

export default async function ChildAccessLayout({
  children,
  params,
}: LayoutProps<"/[locale]/min-side/barn/[studentId]">) {
  const { locale, studentId } = await params;
  const [context, myChildren] = await Promise.all([getPortalContext(), getMyChildren()]);
  if (!context.user) redirect({ href: "/min-side/logg-inn", locale });
  if (!myChildren.some((row) => row.student_id === studentId)) notFound();

  return children;
}
