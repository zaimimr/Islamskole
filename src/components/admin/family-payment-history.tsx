import Link from "next/link";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill, type StatusTone } from "@/components/admin/status-pill";
import { formatNok } from "@/lib/money";
import { shortDate } from "@/lib/payment-request-state";

export type FamilyHistoryPayment = {
  id: string;
  amountOre: number;
  status: string;
  method: string;
  createdAt: string;
  paidAt: string | null;
  dueDate: string | null;
  sentAt: string | null;
  reminderCount: number;
  voided: boolean;
  sharedWith: number;
};

export type FamilyHistoryChild = {
  id: string;
  name: string;
  href: string;
  payments: FamilyHistoryPayment[];
};

const methodLabels: Record<string, string> = {
  vipps: "Vipps",
  kontant: "Kontant",
  bank: "Bank",
  annet: "Annet",
  sadaqa: "Sadaqa-støtte",
};

function paymentStatus(payment: FamilyHistoryPayment, today: string): { label: string; tone: StatusTone } {
  if (payment.voided) return { label: "Annullert", tone: "neutral" };
  switch (payment.status) {
    case "fanget":
      return { label: "Betalt", tone: "ok" };
    case "refundert":
      return { label: "Refundert", tone: "neutral" };
    case "autorisert":
      return { label: "Betaling venter", tone: "warn" };
    case "avbrutt":
      return { label: "Utløpt", tone: "danger" };
    case "feilet":
      return { label: "Feilet", tone: "danger" };
    default:
      if (payment.dueDate && payment.dueDate < today) return { label: "Forfalt", tone: "danger" };
      return { label: "Ikke betalt", tone: "warn" };
  }
}

function paymentDetail(payment: FamilyHistoryPayment): string {
  const open = !payment.voided && (payment.status === "opprettet" || payment.status === "avbrutt");
  const parts = [methodLabels[payment.method] ?? payment.method];
  if (open && payment.sentAt) parts.push(`sendt ${shortDate(payment.sentAt)}`);
  if (open && payment.dueDate) parts.push(`frist ${shortDate(payment.dueDate)}`);
  if (open && payment.reminderCount > 0) {
    parts.push(`${payment.reminderCount} ${payment.reminderCount === 1 ? "påminnelse" : "påminnelser"}`);
  }
  return parts.join(" · ");
}

export function FamilyPaymentHistory({
  rows,
  schoolYearLabel,
  today,
}: {
  rows: FamilyHistoryChild[];
  schoolYearLabel: string;
  today: string;
}) {
  if (rows.length === 0) return null;
  return (
    <Card className="rounded-2xl border-0 ring-1 ring-[#E3DED3]">
      <CardHeader>
        <CardTitle className="font-heading text-xl">Betalingshistorikk {schoolYearLabel}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-2">
        {rows.map((child) => (
          <section key={child.id} aria-label={child.name} className="grid content-start gap-2">
            <Link href={child.href} className="font-heading text-lg font-bold text-[#216A2B] hover:underline">
              {child.name}
            </Link>
            {child.payments.length === 0 ? (
              <p className="rounded-xl bg-[#F7F6F1] px-4 py-3 text-sm text-admin-muted">Ingen betalinger</p>
            ) : (
              <ul className="divide-y divide-[#ECE8DF] overflow-hidden rounded-xl border border-[#E8E3D9]">
                {child.payments.map((payment) => {
                  const status = paymentStatus(payment, today);
                  return (
                    <li key={payment.id} className={payment.voided ? "bg-[#FAF9F5]" : undefined}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                        <span className="w-14 shrink-0 text-sm text-admin-muted tabular-nums">
                          {shortDate(payment.paidAt ?? payment.createdAt)}
                        </span>
                        <span
                          className={`font-heading text-lg font-bold tabular-nums ${payment.voided ? "line-through" : ""}`}
                        >
                          {formatNok(payment.amountOre)}
                        </span>
                        <StatusPill tone={status.tone} className="ml-auto">
                          {status.label}
                        </StatusPill>
                        <span className="flex w-full flex-wrap items-center gap-x-2 text-xs text-admin-muted">
                          {paymentDetail(payment)}
                          {payment.sharedWith > 1 ? (
                            <span className="inline-flex items-center gap-1">
                              <Users aria-hidden="true" className="size-3" />
                              {payment.sharedWith} barn
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
