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
  const grouped = new Map<string, { payment: FamilyHistoryPayment; shares: { child: FamilyHistoryChild; amountOre: number }[] }>();
  for (const child of rows) {
    for (const payment of child.payments) {
      const entry = grouped.get(payment.id) ?? { payment, shares: [] };
      entry.shares.push({ child, amountOre: payment.amountOre });
      grouped.set(payment.id, entry);
    }
  }
  const payments = [...grouped.values()].sort((a, b) =>
    (b.payment.paidAt ?? b.payment.createdAt).localeCompare(a.payment.paidAt ?? a.payment.createdAt),
  );
  const withoutPayments = rows.filter((child) => child.payments.length === 0);
  const childLink = (child: FamilyHistoryChild) => (
    <Link href={child.href} className="font-bold text-[#216A2B] hover:underline">
      {child.name}
    </Link>
  );
  return (
    <section
      aria-labelledby="family-payment-history"
      className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]"
    >
      <h2 id="family-payment-history" className="px-5 pt-5 pb-3 font-heading text-lg font-bold sm:px-6 sm:pt-6">
        Betalingshistorikk {schoolYearLabel}
      </h2>
      <div className="border-t border-[#E8E3D9]">
        <Table className="text-sm">
          <TableHeader className="bg-[#F7F6F1]">
            <TableRow>
              <TableHead className="hidden w-20 pl-5 sm:table-cell sm:pl-6">Dato</TableHead>
              <TableHead className="pl-5 sm:pl-2">Barn</TableHead>
              <TableHead className="text-right">Beløp</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Detaljer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map(({ payment, shares }) => {
              const status = paymentStatus(payment, today);
              const detail = paymentDetail(payment);
              const date = shortDate(payment.paidAt ?? payment.createdAt);
              const combined = shares.length > 1;
              const total = shares.reduce((sum, share) => sum + share.amountOre, 0);
              return (
                <TableRow key={payment.id} className={payment.voided ? "text-admin-muted" : undefined}>
                  <TableCell className="hidden pl-5 align-top tabular-nums sm:table-cell sm:pl-6">{date}</TableCell>
                  <TableCell className="pl-5 align-top whitespace-normal sm:pl-2">
                    {combined ? (
                      <>
                        <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-[#E4F1FA] px-2 py-0.5 text-[0.6875rem] font-bold text-[#245D7C]">
                          <Users aria-hidden="true" className="size-3" />
                          Samlet
                        </span>
                        <ul className="grid gap-0.5">
                          {shares.map((share) => (
                            <li key={share.child.id} className="flex flex-wrap items-baseline gap-x-2">
                              {childLink(share.child)}
                              <span className="text-xs text-admin-muted tabular-nums">{formatNok(share.amountOre)}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      childLink(shares[0].child)
                    )}
                    <span className="block text-xs text-admin-muted tabular-nums sm:hidden">{date}</span>
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <span className={`font-bold tabular-nums ${payment.voided ? "line-through" : ""}`}>
                      {formatNok(total)}
                    </span>
                    {payment.sharedWith > shares.length ? (
                      <span className="flex items-center justify-end gap-1 text-xs text-admin-muted">
                        <Users aria-hidden="true" className="size-3" />
                        {payment.sharedWith} barn
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top whitespace-normal">
                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                    <span className="mt-1 block text-xs text-admin-muted md:hidden">{detail}</span>
                  </TableCell>
                  <TableCell className="hidden align-top whitespace-normal text-admin-muted md:table-cell">
                    {detail}
                  </TableCell>
                </TableRow>
              );
            })}
            {withoutPayments.map((child) => (
              <TableRow key={child.id}>
                <TableCell className="hidden pl-5 sm:table-cell sm:pl-6" />
                <TableCell className="pl-5 whitespace-normal sm:pl-2">{childLink(child)}</TableCell>
                <TableCell colSpan={3} className="text-admin-muted">
                  Ingen betalinger
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
