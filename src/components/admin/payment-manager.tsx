"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  Link2,
  Mail,
  RefreshCw,
  Check,
  Undo2,
  Ban,
  Trash2,
  EyeOff,
  RotateCcw,
  MoreHorizontal,
  Plus,
  Users,
  ChevronDown,
  Pencil,
  AlertTriangle,
  Shuffle,
} from "lucide-react";
import {
  updateStudentFee,
  grantFeeAdjustment,
  revokeFeeAdjustment,
  voidPayment,
  restorePayment,
  registerManualPayment,
  syncPaymentStatus,
  captureVippsPayment,
  cancelVippsPayment,
  sendPaymentLink,
  deletePayment,
  reallocatePayment,
} from "@/app/[locale]/admin/students-actions";
import {
  RefundPaymentDialog,
  type RefundAllocation,
} from "@/components/admin/refund-payment-dialog";
import {
  OverpaymentToGiftButton,
  SadaqaCoverDialog,
} from "@/components/admin/sadaqa";
import {
  PaymentRequestActions,
  RequestStatus,
} from "@/components/admin/payment-request";
import { shortDate, type OpenRequest } from "@/lib/payment-request-state";
import { formatNok } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type SchoolYearOption = { id: string; label: string };
export type PaymentRow = {
  id: string;
  amount: number;
  currency: string;
  schoolYear: string | null;
  schoolYearId: string | null;
  description: string | null;
  status: string;
  method: string;
  paid_at: string | null;
  due_date: string | null;
  redirect_url: string | null;
  created_at: string | null;
  reference: string | null;
  voided_at: string | null;
  void_reason: string | null;
  payer_name: string | null;
  payer_phone: string | null;
  payer_email: string | null;
  vipps_state: string | null;
  vipps_payment_method: string | null;
  psp_reference: string | null;
  last_synced_at: string | null;
  captured_at: string | null;
  allocatedAmount: number | null;
  sharedWith: number | null;
  manuallyAllocated: boolean;
  capturedAmount: number;
  refundedAmount: number;
  refundAllocations: RefundAllocation[];
};

export type YearBalance = { owed: number; paid: number; remaining: number };
export type YearFee = { amount: number; discount: number; note: string | null };
export type AdjustmentRow = {
  id: string;
  schoolYearId: string;
  type: string;
  amount: number;
  note: string;
  teacherName: string | null;
  createdAt: string | null;
};
export type TeacherOption = { id: string; name: string };

const adjustmentTypeLabels: Record<string, string> = {
  soskenrabatt: "Søskenrabatt",
  laererbarn: "Lærerbarn",
  frivillig: "Frivillig",
  annet: "Annet fritak",
};
type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  success: string;
  action: () => Promise<ActionOutcome>;
};

type ActionOutcome = { ok: boolean; error?: string; note?: string };

const statusLabels: Record<string, string> = {
  opprettet: "Ikke betalt",
  autorisert: "Betaling venter",
  fanget: "Betalt",
  avbrutt: "Utløpt",
  refundert: "Refundert",
  feilet: "Feilet",
};

const methodLabels: Record<string, string> = {
  vipps: "Vipps",
  kontant: "Kontant",
  bank: "Bank",
  annet: "Annet",
  sadaqa: "Sadaqa-støtte",
};

function formatLongDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Oslo",
  });
}

function formatDate(value: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "-";
  return shortDate(value);
}

function shortNote(payment: PaymentRow): string | null {
  if (payment.payer_name) return payment.payer_name;
  if (payment.payer_phone) return payment.payer_phone;
  const description = payment.description;
  if (!description) return null;
  const tail = description.split("·").pop()?.trim();
  return tail && tail.length > 1 ? tail : description;
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold text-admin-muted">{label}</dt>
      <dd
        className={`truncate ${mono ? "font-mono text-xs" : ""}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function ReceiptToggle({
  id,
  checked,
  onChange,
  className,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  className?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold ${className ?? ""}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[#3C8F44]"
      />
      Send kvittering på e-post til foresatte
    </label>
  );
}

export function PaymentManager({
  studentId,
  studentName,
  classByYear,
  schoolYears,
  defaultSchoolYearId,
  defaultAmount,
  balancesByYear,
  feesByYear,
  payments,
  adjustments = [],
  teachers = [],
  requestsByYear = {},
  suggestedByYear = {},
  today,
}: {
  studentId: string;
  studentName: string;
  classByYear: Record<string, string>;
  schoolYears: SchoolYearOption[];
  defaultSchoolYearId: string | null;
  defaultAmount: number | null;
  balancesByYear: Record<string, YearBalance>;
  feesByYear: Record<string, YearFee>;
  payments: PaymentRow[];
  adjustments?: AdjustmentRow[];
  teachers?: TeacherOption[];
  requestsByYear?: Record<string, OpenRequest | null>;
  suggestedByYear?: Record<string, { amount: number; dueDate: string } | null>;
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [year, setYear] = useState(
    defaultSchoolYearId ?? schoolYears[0]?.id ?? "",
  );
  const [formOpen, setFormOpen] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [manualMethod, setManualMethod] = useState("kontant");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [refundFor, setRefundFor] = useState<PaymentRow | null>(null);
  const [sendReceipt, setSendReceipt] = useState(true);
  const [adjustmentType, setAdjustmentType] = useState("annet");
  const adjustmentFormRef = useRef<HTMLFormElement>(null);

  const currentClass = classByYear[year] ?? null;
  const request = requestsByYear[year] ?? null;
  const suggestion = suggestedByYear[year] ?? null;
  const balance = balancesByYear[year] ?? null;
  const fee = feesByYear[year] ?? null;
  const remainingNok =
    balance && balance.remaining > 0
      ? Math.round(balance.remaining / 100)
      : null;
  const suggestedAmount = remainingNok ?? defaultAmount ?? null;
  const feeBaseNok =
    fee && fee.amount > 0
      ? Math.round(fee.amount / 100)
      : balance && balance.owed > 0
        ? Math.round(balance.owed / 100)
        : (defaultAmount ?? 0);

  const yearPayments = payments.filter(
    (payment) => payment.schoolYearId === year || payment.schoolYearId === null,
  );

  const yearAdjustments = adjustments.filter(
    (adjustment) => adjustment.schoolYearId === year,
  );
  const adjustmentTotal = yearAdjustments.reduce(
    (sum, adjustment) => sum + adjustment.amount,
    0,
  );

  const progress =
    balance && balance.owed > 0
      ? Math.min(100, Math.round((balance.paid / balance.owed) * 100))
      : balance && balance.paid > 0
        ? 100
        : 0;

  const state =
    balance && balance.owed > 0 && balance.remaining <= 0
      ? "betalt"
      : balance && balance.paid > 0
        ? "delvis"
        : "ubetalt";

  function handleManual(formData: FormData) {
    formData.set("student_id", studentId);
    formData.set("school_year_id", year);
    formData.set("send_receipt", sendReceipt ? "true" : "false");
    startTransition(async () => {
      const result = await registerManualPayment(formData);
      if (result.ok) {
        toast.success("Betaling registrert", { description: result.note });
        setFormOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleFee(formData: FormData) {
    formData.set("student_id", studentId);
    formData.set("school_year_id", year);
    startTransition(async () => {
      const result = await updateStudentFee(formData);
      if (result.ok) {
        toast.success("Kravet er oppdatert");
        setFeeOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function exemptStudent() {
    const owedNok = balance ? Math.round(balance.owed / 100) : feeBaseNok;
    if (owedNok <= 0) {
      toast.error("Eleven har ingenting utestående å frita");
      return;
    }
    const formData = new FormData();
    formData.set("student_id", studentId);
    formData.set("school_year_id", year);
    formData.set("type", "annet");
    formData.set("amount_nok", String(owedNok));
    formData.set("note", "Skal ikke betale");
    startTransition(async () => {
      const result = await grantFeeAdjustment(formData);
      if (result.ok) {
        toast.success("Eleven er fritatt");
        setFeeOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleAdjustment(formData: FormData) {
    const type = String(formData.get("type") ?? "");
    const amount = Math.round(Number(formData.get("amount_nok") ?? 0) * 100);
    const reason = String(formData.get("note") ?? "").trim();
    const limit = balance ? balance.owed : null;
    if (!(amount > 0) || !reason) {
      toast.error("Fyll inn beløp og begrunnelse");
      return;
    }
    if (limit != null && amount - limit >= 100) {
      toast.error(
        limit <= 0
          ? "Eleven skal ikke betale noe dette skoleåret"
          : `Beløpet er større enn det eleven skal betale (${formatNok(limit)})`,
      );
      return;
    }
    const payload = new FormData();
    payload.set("student_id", studentId);
    payload.set("school_year_id", year);
    payload.set("amount_nok", String(amount / 100));
    payload.set("type", type);
    payload.set("note", reason);
    const teacher = formData.get("teacher_guardian_id");
    if (typeof teacher === "string" && teacher) {
      payload.set("teacher_guardian_id", teacher);
    }
    const typeLabel = adjustmentTypeLabels[type] ?? "Fradrag";
    setConfirmation({
      title: `Gi ${typeLabel.toLowerCase()} på ${formatNok(amount)}?`,
      description: `Kravet reduseres med ${formatNok(amount)}. Fradraget logges med begrunnelsen og kan oppheves.`,
      confirmLabel: "Gi fradrag",
      success: "Fradrag lagt til",
      action: async () => {
        const result = await grantFeeAdjustment(payload);
        if (result.ok) adjustmentFormRef.current?.reset();
        return result;
      },
    });
  }

  function run(action: () => Promise<ActionOutcome>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success, { description: result.note });
        router.refresh();
      } else {
        toast.error(result.error ?? "Noe gikk galt");
      }
    });
  }

  function copyLink(paymentId: string) {
    const base = (
      process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin
    ).replace(/\/$/, "");
    navigator.clipboard.writeText(`${base}/api/vipps/pay/${paymentId}`);
    toast.success("Betalingslenke kopiert");
  }

  function confirmAction() {
    if (!confirmation) return;
    const selected = confirmation;
    setConfirmation(null);
    run(selected.action, selected.success);
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-none ring-1 ring-[#E3DED3]">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-[#ECE8DF] px-5 py-5 sm:px-6">
        <div>
          <CardTitle className="font-heading text-2xl font-bold">
            Betaling
          </CardTitle>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {currentClass ? (
            <Badge variant="outline">{currentClass}</Badge>
          ) : (
            <Badge variant="secondary" title="Betaling kan registreres uansett">
              Ingen klasse
            </Badge>
          )}
          <SelectField
            aria-label="Skoleår"
            value={year}
            onValueChange={setYear}
            className="min-w-36 flex-1 sm:w-48 sm:flex-none"
            triggerClassName="font-semibold"
            options={schoolYears.map((option) => ({
              value: option.id,
              label: option.label,
            }))}
          />
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 px-4 py-5 sm:px-6 [&_[data-slot=button]]:min-h-11">
        <section className="grid gap-3 rounded-xl bg-[#FAF9F5] p-4 ring-1 ring-[#E8E3D9]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-heading text-3xl font-bold tabular-nums">
              {formatNok(balance?.paid ?? 0)}
              <span className="ml-1 font-sans text-base font-semibold text-admin-muted">
                {" "}
                av {formatNok(balance?.owed ?? 0)}
              </span>
            </p>
            {((fee?.discount ?? 0) > 0 || adjustmentTotal > 0) &&
            (balance?.owed ?? 0) === 0 ? (
              <Badge className="bg-[#F0F0ED] text-[#4E5550]">
                Skal ikke betale
              </Badge>
            ) : state === "betalt" ? (
              <Badge className="bg-[#DCEDDD] text-[#216A2B]">
                Ferdig betalt
              </Badge>
            ) : request ? (
              <RequestStatus balance={balance} request={request} today={today} />
            ) : state === "delvis" ? (
              <Badge className="bg-[#FEEDCA] text-[#775108]">
                Gjenstår {formatNok(balance?.remaining ?? 0)}
              </Badge>
            ) : (
              <Badge className="bg-[#F9DEDB] text-[#8B2F2B]">Ikke betalt</Badge>
            )}
          </div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-[#EEEAE1]"
            role="progressbar"
            aria-label="Andel av betalingskravet som er innbetalt"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full w-full origin-left rounded-full transition-transform ${
                state === "betalt" ? "bg-[#3C8F44]" : "bg-[#E9B63B]"
              }`}
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-admin-muted">
            <span>
              Årsavgift {formatNok(fee?.amount ?? balance?.owed ?? 0)}
              {(fee?.discount ?? 0) + adjustmentTotal > 0
                ? ` · fradrag ${formatNok((fee?.discount ?? 0) + adjustmentTotal)}`
                : ""}
            </span>
            {fee?.note ? <span>· {fee.note}</span> : null}
            <Button
              type="button"
              variant="ghost"
              className="rounded-lg px-2 font-bold text-[#277A31]"
              onClick={() => setFeeOpen((open) => !open)}
            >
              <Pencil className="size-3.5" />
              Endre årsavgift
            </Button>
          </div>
        </section>

        {feeOpen ? (
          <div className="grid gap-4 rounded-xl bg-[#FFF8E9] p-4 ring-1 ring-[#E8D6AA]">
            <form
              key={`fee-${year}`}
              action={handleFee}
              className="grid gap-3 sm:grid-cols-2 sm:items-end [&_[data-slot=input]]:min-h-11"
            >
              <div className="grid gap-2">
                <Label htmlFor="fee_amount" required>
                  Skal betale (kr)
                </Label>
                <Input
                  id="fee_amount"
                  name="amount_nok"
                  type="number"
                  min="0"
                  step="1"
                  required
                  defaultValue={feeBaseNok}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fee_note">Notat</Label>
                <Input
                  id="fee_note"
                  name="note"
                  type="text"
                  placeholder="Hvorfor endres kravet?"
                  defaultValue={fee?.note ?? ""}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2 [&_[data-slot=button]]:rounded-xl [&_[data-slot=button]]:px-4">
                <Button type="submit" disabled={pending}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Lagre krav
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={exemptStudent}
                >
                  Skal ikke betale
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setFeeOpen(false)}
                >
                  Avbryt
                </Button>
              </div>
            </form>

            <div className="grid gap-2 border-t border-[#E8D6AA] pt-3">
              <p className="text-xs font-bold tracking-[0.04em] uppercase text-[#6B5524]">
                Rabatter og fritak
              </p>
              {yearAdjustments.length > 0 ? (
                <ul className="grid gap-1.5">
                  {yearAdjustments.map((adjustment) => (
                    <li
                      key={adjustment.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm ring-1 ring-[#E8D6AA]"
                    >
                      <span>
                        <span className="font-bold">
                          {adjustmentTypeLabels[adjustment.type] ??
                            adjustment.type}
                          {adjustment.teacherName
                            ? ` (${adjustment.teacherName})`
                            : ""}
                        </span>{" "}
                        <span className="text-admin-muted">
                          − {formatNok(adjustment.amount)} · {adjustment.note}
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pending}
                        className="h-8 rounded-lg px-2 text-xs font-bold text-[#8B2F2B]"
                        onClick={() =>
                          setConfirmation({
                            title: "Opphev fradraget?",
                            description: `${adjustmentTypeLabels[adjustment.type] ?? adjustment.type} på ${formatNok(adjustment.amount)} fjernes, og beløpet legges tilbake på kravet. Historikken beholdes.`,
                            confirmLabel: "Opphev fradrag",
                            success: "Fradraget er opphevet",
                            action: () =>
                              revokeFeeAdjustment(
                                adjustment.id,
                                "Opphevet fra elevsiden",
                              ),
                          })
                        }
                      >
                        Opphev
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#6B5524]">
                  Ingen rabatter eller fritak i år.
                </p>
              )}

              <form
                key={`adjustment-${year}`}
                ref={adjustmentFormRef}
                onSubmit={(event) => {
                  event.preventDefault();
                  handleAdjustment(new FormData(event.currentTarget));
                }}
                className="grid gap-3 sm:grid-cols-4 sm:items-start [&_[data-slot=input]]:min-h-11"
              >
                <div className="grid gap-2">
                  <Label htmlFor="adjustment_type">Type</Label>
                  <SelectField
                    id="adjustment_type"
                    name="type"
                    value={adjustmentType}
                    onValueChange={setAdjustmentType}
                    options={[
                      { value: "soskenrabatt", label: "Søskenrabatt" },
                      { value: "laererbarn", label: "Lærerbarn" },
                      { value: "frivillig", label: "Frivillig" },
                      { value: "annet", label: "Annet fritak" },
                    ]}
                  />
                </div>
                {teachers.length > 0 ? (
                  <div className="grid gap-2">
                    <Label htmlFor="adjustment_teacher">Lærer</Label>
                    <SelectField
                      id="adjustment_teacher"
                      name="teacher_guardian_id"
                      defaultValue=""
                      options={[
                        { value: "", label: "Velg lærer (for lærerbarn)" },
                        ...teachers.map((teacher) => ({
                          value: teacher.id,
                          label: teacher.name,
                        })),
                      ]}
                    />
                  </div>
                ) : null}
                <div className="grid gap-2">
                  <Label htmlFor="adjustment_amount" required>
                    Beløp (kr)
                  </Label>
                  <Input
                    id="adjustment_amount"
                    name="amount_nok"
                    type="number"
                    min="1"
                    step="1"
                    required
                    aria-describedby="adjustment_limit"
                  />
                  {balance ? (
                    <p id="adjustment_limit" className="text-xs text-[#6B5524]">
                      Skal betale: {formatNok(balance.owed)}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="adjustment_note" required>
                    Begrunnelse
                  </Label>
                  <Input
                    id="adjustment_note"
                    name="note"
                    type="text"
                    required
                    placeholder="Hvorfor gis fradraget?"
                  />
                </div>
                <div className="sm:col-span-4">
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={pending}
                    className="rounded-xl px-4"
                  >
                    {pending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Legg til fradrag
                  </Button>
                </div>
              </form>
              <p className="text-xs text-[#6B5524]">
                Rabatter og fritak logges med begrunnelse og kan oppheves.
              </p>
            </div>
          </div>
        ) : null}

        {formOpen ? (
          <div className="grid gap-4 rounded-xl bg-[#F2F8F2] p-4 ring-1 ring-[#C9E0CB] [&_[data-slot=input]]:min-h-11">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold">Registrer betaling</p>
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl px-3 font-bold"
                onClick={() => setFormOpen(false)}
              >
                Avbryt
              </Button>
            </div>

              <form
                key={`manual-${year}`}
                action={handleManual}
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
              >
                <div className="grid gap-2">
                  <Label htmlFor="manual_amount" required>
                    Beløp (kr)
                  </Label>
                  <Input
                    id="manual_amount"
                    name="amount_nok"
                    type="number"
                    min="1"
                    step="1"
                    required
                    defaultValue={suggestedAmount ?? ""}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="manual_paid_at" required>
                    Betalt dato
                  </Label>
                  <Input
                    id="manual_paid_at"
                    name="paid_at"
                    type="date"
                    required
                    max={today}
                    defaultValue={today}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="manual_method" required>
                    Måte
                  </Label>
                  <SelectField
                    id="manual_method"
                    name="method"
                    required
                    value={manualMethod}
                    onValueChange={setManualMethod}
                    options={[
                      { value: "kontant", label: "Kontant" },
                      { value: "bank", label: "Bankoverføring" },
                      { value: "vipps", label: "Vipps" },
                      { value: "annet", label: "Annet" },
                    ]}
                  />
                </div>
                {manualMethod === "vipps" ? (
                  <div className="grid gap-2">
                    <Label htmlFor="manual_order_id">Ordre-ID fra Vipps</Label>
                    <Input
                      id="manual_order_id"
                      name="order_id"
                      type="text"
                      placeholder="13808360132"
                    />
                  </div>
                ) : null}
                <div className="grid gap-2">
                  <Label htmlFor="manual_payer_name">Betalt av</Label>
                  <Input
                    id="manual_payer_name"
                    name="payer_name"
                    type="text"
                    autoComplete="off"
                    placeholder="Valgfritt"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="manual_note">Notat</Label>
                  <Input
                    id="manual_note"
                    name="note"
                    type="text"
                    placeholder="Valgfritt"
                  />
                </div>
                <ReceiptToggle
                  id="manual_receipt"
                  checked={sendReceipt}
                  onChange={setSendReceipt}
                  className="sm:col-span-2 lg:col-span-4"
                />
                <Button
                  type="submit"
                  disabled={pending}
                  className="justify-self-start sm:col-span-2 lg:col-span-4"
                >
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Registrer
                </Button>
              </form>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {year ? (
              <PaymentRequestActions
                schoolYearId={year}
                studentIds={[studentId]}
                balance={balance}
                request={request}
                today={today}
                suggestedAmount={suggestion?.amount ?? null}
                suggestedDueDate={suggestion?.dueDate ?? null}
                title={studentName}
                showStatus={false}
              />
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="rounded-xl px-4 font-bold"
              onClick={() => setFormOpen(true)}
            >
              <Plus className="size-4" />
              Registrer betaling
            </Button>
            {balance && balance.remaining > 0 ? (
              <SadaqaCoverDialog
                key={`sadaqa-${year}-${balance.remaining}`}
                schoolYearId={year}
                families={[
                  {
                    id: studentId,
                    name: studentName,
                    children: [
                      {
                        id: studentId,
                        name: studentName,
                        remainingOre: balance.remaining,
                      },
                    ],
                  },
                ]}
              />
            ) : null}
            {balance && balance.paid > balance.owed ? (
              <OverpaymentToGiftButton
                studentId={studentId}
                schoolYearId={year}
                childName={studentName}
                excessOre={balance.paid - balance.owed}
              />
            ) : null}
          </div>
        )}

        {yearPayments.length === 0 ? (
          <div className="rounded-xl bg-[#F7F6F1] px-4 py-6 text-sm text-admin-muted">
            Ingen betalinger dette skoleåret.
          </div>
        ) : (
          <section aria-labelledby="student-payment-history">
            <h3
              id="student-payment-history"
              className="mb-3 font-heading text-xl font-semibold"
            >
              Betalingshistorikk
            </h3>
            <ul className="divide-y divide-[#ECE8DF] overflow-hidden rounded-xl border border-[#E8E3D9]">
              {yearPayments.map((payment) => {
                const voided = Boolean(payment.voided_at);
                const vippsLink =
                  payment.method === "vipps" &&
                  !(payment.reference ?? "").startsWith("manual-");
                const note = shortNote(payment);
                const shown = payment.allocatedAmount ?? payment.amount;
                return (
                  <li
                    key={payment.id}
                    className={voided ? "bg-[#FAF9F5]" : undefined}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
                      <span className="w-16 shrink-0 text-sm text-admin-muted">
                        {formatDate(payment.paid_at ?? payment.created_at)}
                      </span>

                      <span
                        className={`w-28 shrink-0 font-heading text-lg font-bold tabular-nums ${
                          voided ? "line-through" : ""
                        }`}
                      >
                        {formatNok(shown)}
                      </span>

                      <Badge variant="outline" className="shrink-0">
                        {methodLabels[payment.method] ?? payment.method}
                      </Badge>

                      {voided ? (
                        <Badge variant="destructive" className="shrink-0">
                          Annullert
                        </Badge>
                      ) : payment.status !== "fanget" ? (
                        <Badge variant="secondary" className="shrink-0">
                          {statusLabels[payment.status] ?? payment.status}
                        </Badge>
                      ) : null}

                      {payment.manuallyAllocated ? (
                        <Badge variant="outline" className="shrink-0">
                          Manuelt fordelt
                        </Badge>
                      ) : null}

                      {payment.due_date && payment.status !== "fanget" ? (
                        <Badge variant="outline" className="shrink-0">
                          Frist {formatDate(payment.due_date)}
                        </Badge>
                      ) : null}

                      <span className="min-w-[10rem] flex-1 truncate text-sm text-admin-muted">
                        {note}
                        {payment.sharedWith ? (
                          <span
                            className="ml-2 inline-flex items-center gap-1"
                            title={`Del av en samlet betaling på ${formatNok(
                              payment.amount,
                            )} for ${payment.sharedWith} barn`}
                          >
                            <Users className="size-3" />
                            {payment.sharedWith} barn
                          </span>
                        ) : null}
                      </span>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11 rounded-xl"
                        aria-label="Vis detaljer"
                        aria-expanded={expanded === payment.id}
                        onClick={() =>
                          setExpanded((current) =>
                            current === payment.id ? null : payment.id,
                          )
                        }
                      >
                        <ChevronDown
                          className={`size-4 transition-transform ${
                            expanded === payment.id ? "rotate-180" : ""
                          }`}
                        />
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-11 rounded-xl"
                              aria-label="Handlinger"
                              disabled={pending}
                            />
                          }
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="min-w-64 [&_[role=menuitem]]:min-h-11"
                        >
                          {payment.manuallyAllocated ? (
                            <DropdownMenuItem
                              onClick={() =>
                                setConfirmation({
                                  title: "Tilbakestille til automatisk fordeling?",
                                  description:
                                    "Den manuelle fordelingen mellom barna fjernes, og betalingen fordeles på nytt etter hva hvert barn har igjen å betale.",
                                  confirmLabel: "Tilbakestill fordelingen",
                                  success: "Betalingen er fordelt automatisk",
                                  action: () => reallocatePayment(payment.id),
                                })
                              }
                            >
                              <Shuffle className="size-4" />
                              Tilbakestill til automatisk fordeling
                            </DropdownMenuItem>
                          ) : null}
                          {vippsLink ? (
                            <>
                              <DropdownMenuItem
                                onClick={() => copyLink(payment.id)}
                              >
                                <Link2 className="size-4" />
                                Kopier betalingslenke
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  run(
                                    () => sendPaymentLink(payment.id),
                                    "Betalingslenke sendt",
                                  )
                                }
                              >
                                <Mail className="size-4" />
                                Send på e-post
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  run(
                                    () => syncPaymentStatus(payment.id),
                                    "Status oppdatert",
                                  )
                                }
                              >
                                <RefreshCw className="size-4" />
                                Hent status fra Vipps
                              </DropdownMenuItem>
                              {payment.status === "autorisert" ? (
                                <DropdownMenuItem
                                  onClick={() =>
                                    run(
                                      () => captureVippsPayment(payment.id),
                                      "Betaling kapret",
                                    )
                                  }
                                >
                                  <Check className="size-4" />
                                  Kapre reserverte penger
                                </DropdownMenuItem>
                              ) : null}
                              {payment.status === "opprettet" ||
                              payment.status === "autorisert" ? (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setConfirmation({
                                      title: "Avbryt betalingsforespørselen?",
                                      description:
                                        "Betalingslenken slutter å virke. Ingen registrert innbetaling slettes.",
                                      confirmLabel: "Avbryt forespørselen",
                                      success: "Betaling avbrutt",
                                      action: () =>
                                        cancelVippsPayment(payment.id),
                                    })
                                  }
                                >
                                  <Ban className="size-4" />
                                  Avbryt betaling
                                </DropdownMenuItem>
                              ) : null}
                              {payment.capturedAmount > 0 &&
                              payment.refundedAmount <
                                payment.capturedAmount ? (
                                <DropdownMenuItem
                                  onClick={() => setRefundFor(payment)}
                                >
                                  <Undo2 className="size-4" />
                                  Refunder til foresatt
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuSeparator />
                            </>
                          ) : null}

                          {voided ? (
                            <DropdownMenuItem
                              onClick={() =>
                                run(
                                  () => restorePayment(payment.id),
                                  "Annullering angret",
                                )
                              }
                            >
                              <RotateCcw className="size-4" />
                              Angre annullering
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() =>
                                setConfirmation({
                                  title: "Annuller betalingen i oversikten?",
                                  description:
                                    "Betalingen blir bevart i historikken, men teller ikke lenger som innbetalt.",
                                  confirmLabel: "Annuller betalingen",
                                  success: "Betaling annullert",
                                  action: () =>
                                    voidPayment(
                                      payment.id,
                                      "Annullert manuelt",
                                    ),
                                })
                              }
                            >
                              <EyeOff className="size-4" />
                              Annuller (tell ikke med)
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() =>
                              setConfirmation({
                                title: "Slett betalingsforespørselen?",
                                description:
                                  "Bare forespørsler uten registrerte penger kan slettes. Handlingen fjerner raden fra listen.",
                                confirmLabel: "Slett forespørselen",
                                success: "Betaling slettet",
                                action: () => deletePayment(payment.id),
                              })
                            }
                          >
                            <Trash2 className="size-4" />
                            Slett fra listen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {expanded === payment.id ? (
                      <dl className="grid gap-x-6 gap-y-3 border-t border-[#E8E3D9] bg-[#FAF9F5] px-4 py-4 text-sm sm:grid-cols-2">
                        <Detail
                          label="Referanse"
                          value={payment.reference}
                          mono
                        />
                        <Detail
                          label="Betalings-ID"
                          value={payment.psp_reference}
                          mono
                        />
                        <Detail
                          label="Beløp på betalingen"
                          value={formatNok(payment.amount)}
                        />
                        {payment.allocatedAmount != null &&
                        payment.allocatedAmount !== payment.amount ? (
                          <Detail
                            label="Andel for dette barnet"
                            value={formatNok(payment.allocatedAmount)}
                          />
                        ) : null}
                        <Detail
                          label="Betalingsfrist"
                          value={formatLongDate(payment.due_date)}
                        />
                        <Detail
                          label="Status i Vipps"
                          value={payment.vipps_state}
                        />
                        <Detail
                          label="Betalingsmetode"
                          value={payment.vipps_payment_method}
                        />
                        <Detail label="E-post" value={payment.payer_email} />
                        <Detail label="Telefon" value={payment.payer_phone} />
                        <Detail
                          label="Beskrivelse"
                          value={payment.description}
                        />
                        <Detail
                          label="Trukket"
                          value={
                            payment.captured_at
                              ? new Date(payment.captured_at).toLocaleString(
                                  "nb-NO",
                                  {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                    timeZone: "Europe/Oslo",
                                  },
                                )
                              : null
                          }
                        />
                        <Detail
                          label="Sist synkronisert"
                          value={
                            payment.last_synced_at
                              ? new Date(payment.last_synced_at).toLocaleString(
                                  "nb-NO",
                                  {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                    timeZone: "Europe/Oslo",
                                  },
                                )
                              : null
                          }
                        />
                        {payment.void_reason ? (
                          <Detail
                            label="Annullert fordi"
                            value={payment.void_reason}
                          />
                        ) : null}
                      </dl>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </CardContent>
      <AlertDialog
        open={confirmation != null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <span className="mb-2 flex size-11 items-center justify-center rounded-full bg-[#F9DEDB] text-[#8B2F2B]">
              <AlertTriangle aria-hidden="true" className="size-5" />
            </span>
            <AlertDialogTitle className="font-heading text-2xl">
              {confirmation?.title}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="[&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:rounded-xl [&_[data-slot=button]]:px-4">
            <AlertDialogCancel disabled={pending}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAction} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {confirmation?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {refundFor ? (
        <RefundPaymentDialog
          paymentId={refundFor.id}
          capturedAmount={refundFor.capturedAmount}
          refundedAmount={refundFor.refundedAmount}
          payerName={refundFor.payer_name}
          vippsRefundAvailable={
            refundFor.method === "vipps" &&
            !(refundFor.reference ?? "").startsWith("manual-")
          }
          allocations={refundFor.refundAllocations}
          open
          onOpenChange={(next) => {
            if (!next) setRefundFor(null);
          }}
          hideTrigger
        />
      ) : null}
    </Card>
  );
}
