import { getTranslations } from "next-intl/server";
import { CalendarClock, CheckCircle2, Receipt, Users } from "lucide-react";
import { formatNok } from "@/lib/money";
import { formatPortalDay } from "@/lib/portal/parent-format";
import type { EconomyFamily } from "@/lib/portal/economy";
import { ReceiptButton, VippsPayButton } from "@/components/portal/economy/economy-buttons";
import { cn } from "@/lib/utils";

function paidDay(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "nb-NO", {
    timeZone: "Europe/Oslo",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export async function FamilyEconomy({
  family,
  locale,
  showName,
}: {
  family: EconomyFamily;
  locale: string;
  showName: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "portal.economy" });
  const remaining = family.total_remaining;
  const nextInstallment = family.installments.find((row) => row.status !== "betalt");
  const dueLabel = (date: string) =>
    formatPortalDay(date, locale, { day: "numeric", month: "long", year: "numeric" });
  const sectionId = (name: string) => `${name}-${family.family_id}`;

  return (
    <div className="grid gap-6">
      {showName && family.display_name ? (
        <h2 className="font-heading text-2xl font-semibold text-balance">{family.display_name}</h2>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="grid gap-6">
          <section aria-label={t("title")} className="soft-card grid gap-4 px-5 py-6 sm:px-6">
            {remaining > 0 ? (
              <>
                <p className="font-heading text-2xl font-semibold text-balance">
                  {t("remaining", { amount: formatNok(remaining) })}
                </p>
                <VippsPayButton familyId={family.family_id} label={t("payAll")} className="w-full sm:w-fit" />
              </>
            ) : (
              <div className="flex items-start gap-3">
                <CheckCircle2 aria-hidden="true" className="mt-1 size-6 shrink-0 text-brand-green-dark" />
                <div className="grid gap-1">
                  <p className="font-heading text-2xl font-semibold">{t("allPaid")}</p>
                  <p className="text-pretty text-foreground/75">{t("allPaidText")}</p>
                </div>
              </div>
            )}
          </section>

          {nextInstallment && remaining > 0 ? (
            <section aria-labelledby={sectionId("next")} className="soft-card grid gap-3 px-5 py-5 sm:px-6">
              <h3 id={sectionId("next")} className="flex items-center gap-2 font-heading text-lg font-semibold">
                <CalendarClock aria-hidden="true" className="size-5 text-brand-green-dark" />
                {t("installment.next")}
              </h3>
              <div className="grid gap-1">
                <p className="text-xl font-semibold tabular-nums">{formatNok(nextInstallment.amount)}</p>
                <p className="first-letter:uppercase">{t("installment.due", { date: dueLabel(nextInstallment.due_date) })}</p>
                {nextInstallment.children.length ? (
                  <p className="text-sm text-foreground/75">
                    {t("installment.for", { names: nextInstallment.children.join(", ") })}
                  </p>
                ) : null}
              </div>
              <VippsPayButton
                familyId={family.family_id}
                installmentId={nextInstallment.id}
                label={t("installment.pay")}
                className="w-full sm:w-fit"
              />
            </section>
          ) : null}

          {family.children.length ? (
            <section aria-labelledby={sectionId("children")} className="grid gap-3">
              <h3 id={sectionId("children")} className="flex items-center gap-2 font-heading text-lg font-semibold">
                <Users aria-hidden="true" className="size-5 text-brand-green-dark" />
                {t("children.title")}
              </h3>
              <ul className="grid gap-3">
                {family.children.map((child) => (
                  <li key={child.student_id} className="soft-card grid gap-2 px-5 py-4 sm:px-6">
                    <p className="font-semibold">{child.name}</p>
                    <dl className="grid grid-cols-3 gap-2 text-sm">
                      <div className="grid gap-0.5">
                        <dt className="text-muted-foreground">{t("children.owed")}</dt>
                        <dd className="tabular-nums">{formatNok(child.owed)}</dd>
                      </div>
                      <div className="grid gap-0.5">
                        <dt className="text-muted-foreground">{t("children.paid")}</dt>
                        <dd className="tabular-nums">{formatNok(child.paid)}</dd>
                      </div>
                      <div className="grid gap-0.5">
                        <dt className="text-muted-foreground">{t("children.remaining")}</dt>
                        <dd className={cn("font-semibold tabular-nums", child.remaining === 0 && "text-brand-green-dark")}>
                          {formatNok(child.remaining)}
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <div className="grid gap-6">
          {family.installments.length > 1 ? (
            <section aria-labelledby={sectionId("plan")} className="grid gap-3">
              <h3 id={sectionId("plan")} className="flex items-center gap-2 font-heading text-lg font-semibold">
                <CalendarClock aria-hidden="true" className="size-5 text-brand-green-dark" />
                {t("installment.title")}
              </h3>
              <ul className="soft-card grid divide-y divide-foreground/8">
                {family.installments.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 py-3 sm:px-6">
                    <span className="first-letter:uppercase">{dueLabel(row.due_date)}</span>
                    <span className="flex items-baseline gap-3">
                      <span className="tabular-nums">{formatNok(row.amount)}</span>
                      <span
                        className={cn(
                          "text-sm",
                          row.status === "betalt" ? "text-brand-green-dark" : "text-muted-foreground",
                        )}
                      >
                        {t(`installment.status.${row.status}`)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby={sectionId("history")} className="grid gap-3">
            <h3 id={sectionId("history")} className="flex items-center gap-2 font-heading text-lg font-semibold">
              <Receipt aria-hidden="true" className="size-5 text-brand-green-dark" />
              {t("history.title")}
            </h3>
            {family.payments.length ? (
              <ul className="grid gap-3">
                {family.payments.map((payment) => (
                  <li key={payment.id} className="soft-card grid gap-2 px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-lg font-semibold tabular-nums">{formatNok(payment.amount)}</p>
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          payment.status === "fanget" ? "text-brand-green-dark" : "text-muted-foreground",
                        )}
                      >
                        {t(`history.status.${payment.status}`)}
                      </p>
                    </div>
                    <p className="text-sm text-foreground/75">
                      {paidDay(payment.paid_at ?? payment.created_at, locale)} · {t(`history.method.${payment.method}`)}
                    </p>
                    {payment.children.length ? (
                      <ul className="grid gap-0.5 text-sm">
                        {payment.children.map((child) => (
                          <li key={child.name} className="flex justify-between gap-3">
                            <span>{child.name}</span>
                            <span className="shrink-0 whitespace-nowrap tabular-nums">{formatNok(child.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {payment.refunded_amount > 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t("history.refunded", { amount: formatNok(payment.refunded_amount) })}
                      </p>
                    ) : null}
                    {payment.status === "fanget" ? <ReceiptButton paymentId={payment.id} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">{t("history.empty")}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
