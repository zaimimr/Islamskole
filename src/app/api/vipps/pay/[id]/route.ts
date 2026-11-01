import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createPayment,
  getPayment,
  cancelPayment,
  type VippsPaymentState,
} from "@/lib/vipps";
import { buildPaymentDescriptor } from "@/lib/payment-descriptor";
import { syncPaymentByReference } from "@/lib/payments-sync";
import { familyLanguage, paymentFamilyId } from "@/lib/installment-billing";
import {
  capTargetsAtRemaining,
  type ChildTarget,
} from "@/lib/payment-integrity";
import { rateLimit } from "@/lib/rate-limit";

const FRESH_WINDOW_MS = 9 * 60 * 1000;

type Admin = ReturnType<typeof createAdminClient>;

type PaymentRow = {
  id: string;
  reference: string | null;
  amount: number;
  description: string | null;
  status: string;
  redirect_url: string | null;
  updated_at: string | null;
  vipps_state: string | null;
  voided_at: string | null;
  student_id: string | null;
  school_year_id: string | null;
};

type Locale = "no" | "en";

function parseLocale(value: string | null): Locale | null {
  return value === "en" || value === "no" ? value : null;
}

async function remainingByStudent(
  admin: Admin,
  schoolYearId: string,
  studentIds: string[],
): Promise<Map<string, number>> {
  const { data } = await admin
    .from("student_balances")
    .select("student_id, remaining")
    .eq("school_year_id", schoolYearId)
    .in("student_id", studentIds);
  return new Map(
    (data ?? [])
      .filter((row) => row.student_id)
      .map((row) => [row.student_id as string, row.remaining ?? 0]),
  );
}

type CurrentDue = { amount: number | null; targets: ChildTarget[] | null };

async function currentDue(admin: Admin, payment: PaymentRow): Promise<CurrentDue> {
  const yearId = payment.school_year_id;
  if (!yearId) return { amount: null, targets: null };

  const { data: installments } = await admin
    .from("installments")
    .select("student_id, amount")
    .eq("payment_id", payment.id);
  if (installments && installments.length > 0) {
    const planned = new Map<string, number>();
    for (const row of installments) {
      planned.set(row.student_id, (planned.get(row.student_id) ?? 0) + row.amount);
    }
    const remaining = await remainingByStudent(admin, yearId, [...planned.keys()]);
    const capped = capTargetsAtRemaining(
      [...planned].map(([studentId, amount]) => ({ studentId, amount })),
      remaining,
    );
    return {
      amount: capped.reduce((sum, row) => sum + row.amount, 0),
      targets: null,
    };
  }

  const { data: targets } = await admin
    .from("payment_targets")
    .select("student_id, amount")
    .eq("payment_id", payment.id);
  if (targets && targets.length > 0) {
    const remaining = await remainingByStudent(
      admin,
      yearId,
      targets.map((row) => row.student_id),
    );
    const capped = capTargetsAtRemaining(
      targets.map((row) => ({ studentId: row.student_id, amount: row.amount })),
      remaining,
    );
    return {
      amount: capped.reduce((sum, row) => sum + row.amount, 0),
      targets: capped,
    };
  }

  if (payment.student_id) {
    const remaining = await remainingByStudent(admin, yearId, [payment.student_id]);
    if (!remaining.has(payment.student_id)) return { amount: null, targets: null };
    return {
      amount: Math.min(payment.amount, Math.max(remaining.get(payment.student_id) ?? 0, 0)),
      targets: null,
    };
  }

  return { amount: null, targets: null };
}

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/vipps/pay/[id]">,
) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const result = rateLimit("vipps-pay:" + ip, { limit: 10, windowMs: 60_000 });
  if (!result.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) },
      },
    );
  }

  const { id } = await ctx.params;
  const requestedLocale = parseLocale(request.nextUrl.searchParams.get("locale"));
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin)
    .replace(/\/$/, "");

  const admin = createAdminClient();
  const { data } = await admin
    .from("payments")
    .select(
      "id, reference, amount, description, status, redirect_url, updated_at, vipps_state, voided_at, student_id, school_year_id",
    )
    .eq("id", id)
    .maybeSingle();
  const payment = data as unknown as PaymentRow | null;

  let locale: Locale = requestedLocale ?? "no";
  if (payment && !requestedLocale) {
    locale = await familyLanguage(admin, await paymentFamilyId(admin, payment));
  }

  const localePrefix = locale === "en" ? "/en" : "";
  const done = (state: string) =>
    NextResponse.redirect(
      `${site}${localePrefix}/betaling/fullfort?state=${state}${payment ? `&payment=${payment.id}` : ""}`,
    );

  if (!payment) return done("ukjent");
  if (payment.voided_at) return done("annullert");
  if (payment.status === "fanget") return done("fanget");
  if (payment.status === "refundert") return done("ukjent");

  let confirmedState: VippsPaymentState | null = null;
  if (payment.reference && payment.vipps_state) {
    try {
      const current = await getPayment(payment.reference);
      confirmedState = current.state;
      if (current.capturedAmount > 0) {
        await syncPaymentByReference(payment.reference).catch((error) =>
          console.error("Sync after capture failed", { reference: payment.reference, error }),
        );
        return done("fanget");
      }
      if (current.state === "AUTHORIZED") return done("autorisert");
    } catch (error) {
      console.error("Vipps lookup failed before re-issue", {
        reference: payment.reference,
        error,
      });
    }
  }

  const cancelSuperseded = async () => {
    if (!payment.reference || confirmedState !== "CREATED") return;
    try {
      await cancelPayment(payment.reference);
    } catch (error) {
      console.error("Vipps cancel of superseded payment failed", {
        reference: payment.reference,
        error,
      });
    }
  };

  const due = await currentDue(admin, payment);
  if (due.amount !== null && due.amount <= 0) {
    await cancelSuperseded();
    return done("oppgjort");
  }
  const amount = due.amount ?? payment.amount;
  const amountChanged = amount !== payment.amount;

  if (
    !amountChanged &&
    payment.redirect_url &&
    (confirmedState === "CREATED" || confirmedState === null) &&
    payment.updated_at &&
    Date.now() - new Date(payment.updated_at).getTime() < FRESH_WINDOW_MS
  ) {
    return NextResponse.redirect(payment.redirect_url);
  }

  if (amountChanged) {
    if (due.targets) {
      const { error: clearError } = await admin
        .from("payment_targets")
        .delete()
        .eq("payment_id", id);
      const { error: targetError } = clearError
        ? { error: clearError }
        : await admin.from("payment_targets").insert(
            due.targets.map((target) => ({
              payment_id: id,
              student_id: target.studentId,
              amount: target.amount,
            })),
          );
      if (targetError) {
        console.error("Updating payment targets failed", { paymentId: id, error: targetError });
        return done("ukjent");
      }
    }
    const { error: amountError } = await admin
      .from("payments")
      .update({ amount, redirect_url: null } as never)
      .eq("id", id);
    if (amountError) {
      console.error("Updating payment amount failed", { paymentId: id, error: amountError });
      return done("ukjent");
    }
  }

  const descriptor = await buildPaymentDescriptor(admin, id);
  const reference =
    payment.vipps_state === null &&
    payment.redirect_url === null &&
    payment.reference
      ? payment.reference
      : descriptor.reference;
  const returnUrl = `${site}/api/vipps/return?reference=${reference}&locale=${locale}`;
  let redirectUrl: string;
  try {
    const created = await createPayment({
      reference,
      amount,
      description: descriptor.description || payment.description || "Skolepenger",
      returnUrl,
      metadata: descriptor.metadata,
      orderLines: descriptor.orderLines,
    });
    redirectUrl = created.redirectUrl;
  } catch (error) {
    console.error("Vipps create failed", { paymentId: id, error });
    return done("ukjent");
  }

  await cancelSuperseded();

  const { error: updateError } = await admin
    .from("payments")
    .update({
      reference,
      redirect_url: redirectUrl,
      vipps_state: "CREATED",
      status: "opprettet",
      description: descriptor.description || payment.description,
    } as never)
    .eq("id", id);
  if (updateError) {
    console.error("Vipps payment link persistence failed", {
      paymentId: id,
      error: updateError,
    });
    return done("ukjent");
  }

  return NextResponse.redirect(redirectUrl);
}
