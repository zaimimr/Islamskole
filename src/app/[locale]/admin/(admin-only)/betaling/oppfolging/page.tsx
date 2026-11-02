import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { adminBasePath } from "@/components/admin/paths";
import { formatNok } from "@/lib/money";
import { osloToday } from "@/lib/dates";
import {
  getRequestSettings,
  loadPayStatuses,
  loadPlannedInstallments,
  type StudentPayStatus,
} from "@/lib/payment-requests";
import {
  describeRequest,
  nextAutoStep,
  pickNextInstallment,
  planBulkRequests,
  uncoveredRemaining,
  type OpenRequest,
  type RequestKind,
} from "@/lib/payment-request-state";
import {
  BulkRequestButton,
  RequestStatus,
  VippsRequestBlock,
} from "@/components/admin/payment-request";
import { FinanceLoadError } from "../load-error";
import { RequestSettings } from "./request-settings";

export const metadata: Metadata = { title: "Oppfølging" };

type FamilyGroup = {
  key: string;
  familyId: string | null;
  href: string;
  name: string;
  children: StudentPayStatus[];
  balance: { owed: number; paid: number; remaining: number };
  request: OpenRequest | null;
  paused: boolean;
  onPlan: boolean;
};

const kindOrder: Record<RequestKind, number> = {
  utlopt: 0,
  forfalt: 1,
  ubetalt: 2,
  delvis: 3,
  sendt: 4,
  lenke: 4,
  venter: 5,
  betalt: 6,
  fritatt: 7,
};

export default async function FollowUpPage({
  params,
}: PageProps<"/[locale]/admin/betaling/oppfolging">) {
  const { locale } = await params;
  const basePath = adminBasePath(locale);
  const supabase = await createClient();
  const { data: year } = await supabase
    .from("school_years")
    .select("id, label, sem1_due_on")
    .eq("is_active", true)
    .maybeSingle();
  if (!year) {
    return (
      <FinanceLoadError
        title="Ingen aktivt skoleår"
        retryHref={`${basePath}/betaling/oppfolging`}
      />
    );
  }

  const [settings, statuses, planned] = await Promise.all([
    getRequestSettings(supabase),
    loadPayStatuses(supabase, year.id).catch(() => null),
    loadPlannedInstallments(supabase, year.id).catch(() => []),
  ]);
  if (!statuses) {
    return (
      <FinanceLoadError
        title="Oppfølgingen kunne ikke lastes"
        retryHref={`${basePath}/betaling/oppfolging`}
      />
    );
  }

  const today = osloToday();
  const groups = new Map<string, FamilyGroup>();
  for (const status of statuses.values()) {
    if (status.remaining <= 0 || status.owed <= 0) continue;
    const key = status.familyId ?? status.studentId;
    const group = groups.get(key) ?? {
      key,
      familyId: status.familyId,
      href: status.familyId
        ? `${basePath}/familier/${status.familyId}`
        : `${basePath}/elever/${status.studentId}`,
      name: status.familyName ?? status.name,
      children: [],
      balance: { owed: 0, paid: 0, remaining: 0 },
      request: null,
      paused: status.paused,
      onPlan: status.onPlan,
    };
    group.children.push(status);
    group.balance.owed += status.owed;
    group.balance.paid += status.paid;
    group.balance.remaining += status.remaining;
    if (status.request && (!group.request || group.request.sentAt < status.request.sentAt)) {
      group.request = status.request;
    }
    groups.set(key, group);
  }

  const families = [...groups.values()]
    .map((group) => ({
      ...group,
      view: describeRequest(group.balance, group.request, today),
      uncovered: group.request ? uncoveredRemaining(group.children) : 0,
      next: nextAutoStep(
        {
          enabled: settings.enabled,
          paused: group.paused,
          onPlan: group.onPlan,
          remaining: group.balance.remaining,
          request: group.request,
          reminderDays: settings.reminderDays,
          maxReminders: settings.maxReminders,
          firstDueDate: year.sem1_due_on,
          leadDays: settings.leadDays,
        },
        today,
      ),
    }))
    .sort(
      (a, b) =>
        kindOrder[a.view.kind] - kindOrder[b.view.kind] ||
        b.balance.remaining - a.balance.remaining,
    );

  const bulkIds = families.flatMap((family) => family.children.map((child) => child.studentId));
  const bulk = planBulkRequests(statuses.values(), {
    now: new Date(),
    reminderDays: settings.reminderDays,
  });
  const autoTargets = families.filter(
    (family) =>
      nextAutoStep(
        {
          enabled: true,
          paused: family.paused,
          onPlan: family.onPlan,
          remaining: family.balance.remaining,
          request: family.request,
          reminderDays: settings.reminderDays,
          maxReminders: settings.maxReminders,
          firstDueDate: year.sem1_due_on,
          leadDays: settings.leadDays,
        },
        today,
      ) === "Sendes i dag",
  ).length;
  const totalRemaining = families.reduce((sum, family) => sum + family.balance.remaining, 0);
  const needsAction = families.filter(
    (family) =>
      family.uncovered > 0 ||
      ["utlopt", "forfalt", "ubetalt", "delvis"].includes(family.view.kind),
  ).length;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl font-bold tracking-[-0.02em]">Oppfølging</h1>
          <p className="mt-1 text-sm text-admin-muted tabular-nums">
            {families.length} {families.length === 1 ? "familie" : "familier"} skylder{" "}
            {formatNok(totalRemaining)} · {needsAction} trenger oppfølging
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BulkRequestButton
            schoolYearId={year.id}
            studentIds={bulkIds}
            count={bulk.create.length + bulk.renew.length}
            mode="krav"
            today={today}
          />
          <BulkRequestButton
            schoolYearId={year.id}
            studentIds={bulkIds}
            count={bulk.remind.length}
            mode="paminnelse"
            today={today}
          />
        </div>
      </header>

      <RequestSettings
        enabled={settings.enabled}
        leadDays={settings.leadDays}
        reminderDays={settings.reminderDays}
        maxReminders={settings.maxReminders}
        affectedFamilies={autoTargets}
      />

      {families.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center font-heading text-xl font-bold ring-1 ring-[#E3DED3]">
          Alle har betalt
        </p>
      ) : (
        <ul className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
          {families.map((family) => {
            const owing = family.children.map((child) => ({
              id: child.studentId,
              name: child.name,
              remainingOre: child.remaining,
            }));
            return (
              <li
                key={family.key}
                className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={family.href}
                      className="block min-h-11 py-2 font-heading text-lg font-bold wrap-anywhere underline-offset-4 outline-none hover:underline focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {family.children.map((child) => child.name).join(", ")}
                    </Link>
                    <p className="text-sm text-admin-muted wrap-anywhere">
                      {family.name}
                    </p>
                  </div>
                  <p className="shrink-0 font-heading text-lg font-bold tabular-nums text-[#775108]">
                    {formatNok(family.balance.remaining)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <RequestStatus
                    balance={family.balance}
                    request={family.request}
                    today={today}
                  />
                  {family.next ? (
                    <span className="text-xs font-bold text-admin-muted">
                      Auto: {family.next}
                    </span>
                  ) : null}
                </div>
                {family.uncovered > 0 ? (
                  <p className="text-sm font-bold text-[#775108] tabular-nums">
                    Uten krav:{" "}
                    {family.children
                      .filter((child) => !child.request)
                      .map((child) => child.name)
                      .join(", ")}{" "}
                    · {formatNok(family.uncovered)}
                  </p>
                ) : null}
                <VippsRequestBlock
                  schoolYearId={year.id}
                  studentIds={family.children.map((child) => child.studentId)}
                  balance={family.balance}
                  request={family.request}
                  today={today}
                  title={family.name}
                  showStatus={false}
                  nextInstallment={
                    family.onPlan
                      ? pickNextInstallment(
                          planned,
                          family.children.map((child) => child.studentId),
                        )
                      : null
                  }
                  manualChildren={owing}
                  sadaqa={
                    family.familyId
                      ? { id: family.familyId, name: family.name, children: owing }
                      : null
                  }
                  auto={
                    family.familyId
                      ? {
                          familyId: family.familyId,
                          paused: family.paused,
                          globalEnabled: settings.enabled,
                        }
                      : null
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
