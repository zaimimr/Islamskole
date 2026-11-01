import { createHash } from "node:crypto";

export type PaymentProviderState =
  | "CREATED"
  | "ABORTED"
  | "EXPIRED"
  | "AUTHORIZED"
  | "TERMINATED";

export function netPaidAmount(
  capturedAmount: number,
  refundedAmount: number,
): number {
  return Math.max(capturedAmount - refundedAmount, 0);
}

export function mapVippsPaymentState(
  state: PaymentProviderState,
  capturedAmount: number,
  refundedAmount: number,
): string {
  if (capturedAmount > 0 && refundedAmount >= capturedAmount) {
    return "refundert";
  }
  if (capturedAmount > 0) return "fanget";
  switch (state) {
    case "AUTHORIZED":
      return "autorisert";
    case "ABORTED":
    case "EXPIRED":
    case "TERMINATED":
      return "avbrutt";
    default:
      return "opprettet";
  }
}

export function vippsIdempotencyKey(
  operation: "create" | "capture" | "refund" | "cancel",
  reference: string,
  amount?: number,
  nonce?: string,
): string {
  const digest = createHash("sha256")
    .update(
      `${operation}:${reference}:${amount ?? ""}${nonce ? `:${nonce}` : ""}`,
      "utf8",
    )
    .digest("hex")
    .slice(0, 24);
  return `isk-${operation}-${digest}`;
}

export type ChildTarget = { studentId: string; amount: number };

export function capTargetsAtRemaining(
  targets: ChildTarget[],
  remainingByStudent: Map<string, number>,
): ChildTarget[] {
  return targets
    .map((target) => ({
      studentId: target.studentId,
      amount: Math.min(
        target.amount,
        Math.max(remainingByStudent.get(target.studentId) ?? 0, 0),
      ),
    }))
    .filter((target) => target.amount > 0);
}

export async function mapInChunks<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    const chunk = items.slice(index, index + size);
    results.push(...(await Promise.all(chunk.map(fn))));
  }
  return results;
}
