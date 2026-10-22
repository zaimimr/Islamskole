import { createClient } from "@/lib/supabase/server";
import { adminBasePath } from "@/components/admin/paths";
import { FinanceTabs } from "./finance-tabs";

async function getReviewCount() {
  try {
    const supabase = await createClient();
    const [duplicates, balances, issues] = await Promise.all([
      supabase
        .from("duplicate_payment_candidates")
        .select("payment_id", { count: "exact", head: true }),
      supabase.from("student_balances").select("owed, paid"),
      supabase
        .from("payment_reconciliation_issues")
        .select("payment_id", { count: "exact", head: true })
        .is("resolved_at", null),
    ]);
    const overpaid = (
      (balances.data as { owed: number | null; paid: number | null }[] | null) ?? []
    ).filter((row) => (row.paid ?? 0) > (row.owed ?? 0)).length;
    return (duplicates.count ?? 0) + overpaid + (issues.error ? 0 : (issues.count ?? 0));
  } catch {
    return 0;
  }
}

export default async function FinanceLayout({
  children,
  params,
}: LayoutProps<"/[locale]/admin/betaling">) {
  const { locale } = await params;
  const reviewCount = await getReviewCount();

  return (
    <div className="grid grid-cols-1 gap-6 lg:gap-7">
      <FinanceTabs basePath={adminBasePath(locale)} reviewCount={reviewCount} />
      {children}
    </div>
  );
}
