import Link from "next/link";
import { Users } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    <section aria-labelledby="family-payment-history" className="grid gap-3">
      <h2 id="family-payment-history" className="font-heading text-xl font-bold">
        Betalingshistorikk {schoolYearLabel}
      </h2>
      <div className="overflow-hidden rounded-xl ring-1 ring-[#E8E3D9]">
        <Table className="text-sm">
          <TableHeader className="bg-[#F7F6F1]">
            <TableRow>
              <TableHead className="w-20 pl-4">Dato</TableHead>
              <TableHead className="text-right sm:w-32">Beløp</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell xl:hidden 2xl:table-cell">Detaljer</TableHead>
            </TableRow>
          </TableHeader>
          {rows.map((child) => (
            <TableBody key={child.id} aria-label={child.name} className="border-t border-[#E8E3D9] first-of-type:border-t-0">
              <TableRow className="bg-[#FBFAF7] hover:bg-[#FBFAF7]">
                <TableCell colSpan={4} className="pl-4">
                  <Link href={child.href} className="font-bold text-[#216A2B] hover:underline">
                    {child.name}
                  </Link>
                </TableCell>
              </TableRow>
              {child.payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="pl-4 text-admin-muted">
                    Ingen betalinger
                  </TableCell>
                </TableRow>
              ) : (
                child.payments.map((payment) => {
                  const status = paymentStatus(payment, today);
                  const detail = paymentDetail(payment);
                  return (
                    <TableRow key={payment.id} className={payment.voided ? "text-admin-muted" : undefined}>
                      <TableCell className="pl-4 align-top tabular-nums">
                        {shortDate(payment.paidAt ?? payment.createdAt)}
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <span className={`font-bold tabular-nums ${payment.voided ? "line-through" : ""}`}>
                          {formatNok(payment.amountOre)}
                        </span>
                        {payment.sharedWith > 1 ? (
                          <span className="flex items-center justify-end gap-1 text-xs text-admin-muted">
                            <Users aria-hidden="true" className="size-3" />
                            {payment.sharedWith} barn
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top whitespace-normal">
                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                        <span className="mt-1 block text-xs text-admin-muted md:hidden xl:block 2xl:hidden">{detail}</span>
                      </TableCell>
                      <TableCell className="hidden align-top whitespace-normal text-admin-muted md:table-cell xl:hidden 2xl:table-cell">
                        {detail}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          ))}
        </Table>
      </div>
    </section>
  );
}
