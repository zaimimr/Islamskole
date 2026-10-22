import { redirect } from "next/navigation";
import { getIsAdmin } from "@/lib/auth";
import { adminBasePath } from "@/components/admin/paths";

export default async function AdminOnlyLayout({
  children,
  params,
}: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  if (!(await getIsAdmin())) redirect(`${adminBasePath(locale)}/sfo`);
  return children;
}
