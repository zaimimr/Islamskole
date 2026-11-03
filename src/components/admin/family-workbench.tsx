import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  GraduationCap,
  Mail,
  Phone,
  ReceiptText,
  UserRound,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNok } from "@/lib/money";
import { formatOsloDateTime } from "@/lib/dates";
import { SendLoginLinkButton } from "@/components/admin/send-login-link-button";
import {
  TeacherBadge,
  TeacherRole,
  TeacherToggleButton,
} from "@/components/admin/teacher-toggle-button";
import {
  FamilyActionsMenu,
  MergeDuplicateButton,
  RemoveGuardianButton,
  type FamilyOption,
} from "@/app/[locale]/admin/(admin-only)/familier/family-controls";
import { ChildMergeDialog } from "@/app/[locale]/admin/(admin-only)/familier/child-merge-dialog";

export type FamilyStatusTone =
  "success" | "warning" | "danger" | "info" | "neutral";

export type FamilyFact = {
  value: string;
  detail?: string;
  tone: FamilyStatusTone;
};

export type FamilyGuardianSummary = {
  id: string;
  name: string;
  role: string;
  isPrimary?: boolean;
  phone?: string;
  email?: string;
  href?: string;
  isTeacher?: boolean;
};

export type FamilyChildSummary = {
  id: string;
  name: string;
  description?: string;
  href: string;
  admission: FamilyFact;
  placement: FamilyFact;
  enrollment: FamilyFact;
  feeAmountOre: number | null;
  payment: FamilyFact;
};

export type FamilyAllocation = {
  childId: string;
  childName: string;
  amountOre: number;
};

export type FamilyActivity = {
  id: string;
  title: string;
  description?: string;
  occurredAt: string;
  kind: "admission" | "payment" | "placement" | "guardian" | "record";
};

export type FamilyAttentionItem = {
  id: string;
  title: string;
  description: string;
  href: string;
  count?: number;
  tone: FamilyStatusTone;
};

export type FamilyWorkbenchTab = {
  id: "overview" | "children" | "admissions" | "payments" | "history";
  label: string;
  href: string;
};

export type FamilyNextAction = {
  title: string;
  description: string;
  href: string;
  label: string;
  tone: "warning" | "danger" | "info";
  control?: ReactNode;
  inEconomy?: boolean;
};

export type FamilyWorkbenchProps = {
  family: {
    id: string;
    name: string;
    status?: FamilyFact;
    updatedAt?: string;
    address?: string;
    language?: string;
    guardians: FamilyGuardianSummary[];
    children: FamilyChildSummary[];
    schoolYearLabel?: string;
    totalFeeOre?: number | null;
    allocations?: FamilyAllocation[];
    relationshipNote?: string;
  };
  tabs: FamilyWorkbenchTab[];
  activeTab: FamilyWorkbenchTab["id"];
  editFamilyHref?: string;
  addGuardianHref?: string;
  addChildHref?: string;
  editRelationshipsHref?: string;
  nextAction?: FamilyNextAction;
  recentActivity: FamilyActivity[];
  historyHref?: string;
  attentionItems?: FamilyAttentionItem[];
  allAttentionHref?: string;
  duplicateFamilies?: FamilyDuplicate[];
  mergeOptions?: FamilyOption[];
  paymentStatus?: ReactNode;
  economy?: ReactNode;
  economySetup?: ReactNode;
  paymentHistory?: ReactNode;
};

export type FamilyDuplicate = {
  id: string;
  name: string;
  href: string;
  reasons: string[];
};

const statusClasses: Record<FamilyStatusTone, string> = {
  success: "bg-[#DCEDDD] text-[#216A2B]",
  warning: "bg-[#FEEDCA] text-[#775108]",
  danger: "bg-[#F9DEDB] text-[#8B2F2B]",
  info: "bg-[#DDEEF9] text-[#245D84]",
  neutral: "bg-[#F0F0ED] text-[#4D554F]",
};

const statusDotClasses: Record<FamilyStatusTone, string> = {
  success: "bg-[#3C8F44]",
  warning: "bg-[#E5A927]",
  danger: "bg-[#C5524C]",
  info: "bg-[#4C91BD]",
  neutral: "bg-[#7A827C]",
};

const activityIcons = {
  admission: CircleAlert,
  payment: Wallet,
  placement: GraduationCap,
  guardian: UserRound,
  record: ReceiptText,
};

const nextActionClasses: Record<FamilyNextAction["tone"], string> = {
  danger: "bg-[#FFF3F1] ring-[#F1C7C3]",
  info: "bg-[#EEF7FE] ring-[#BFDDF2]",
  warning: "bg-[#FFF8E9] ring-[#EDD49A]",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("nb-NO"))
    .join("");
}

function formatTimestamp(value: string) {
  return formatOsloDateTime(value) || "Tidspunkt mangler";
}

function telHref(phone: string) {
  return `tel:${phone.replace(/\s+/g, "")}`;
}

const contactLinkClass =
  "inline-flex min-h-11 items-center gap-2 rounded-lg font-semibold text-[#277A31] underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 lg:min-h-8";

const panelClass = "min-w-0 rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3] sm:p-6";

const panelTitleClass = "font-heading text-lg font-bold";

const secondaryLinkClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#DDD8CE] bg-white px-3 text-sm font-bold outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50";

function StatusBadge({ fact }: { fact: FamilyFact }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap",
        statusClasses[fact.tone],
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-2 rounded-full", statusDotClasses[fact.tone])}
      />
      {fact.value}
    </span>
  );
}

function InlineFact({ label, fact }: { label: string; fact: FamilyFact }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <dt className="text-admin-muted">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5 font-semibold">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            statusDotClasses[fact.tone],
          )}
        />
        <span className="truncate">
          {fact.value}
          {fact.detail ? (
            <span className="font-normal text-admin-muted"> · {fact.detail}</span>
          ) : null}
        </span>
      </dd>
    </div>
  );
}

function GuardianItem({
  familyId,
  guardian,
  removable,
}: {
  familyId: string;
  guardian: FamilyGuardianSummary;
  removable: boolean;
}) {
  const identity = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#DCEDDD] font-heading text-sm font-bold text-[#216A2B]">
        {initials(guardian.name) || (
          <UserRound aria-hidden="true" className="size-5" />
        )}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-bold">{guardian.name}</span>
          {guardian.isPrimary ? (
            <span className="rounded-full bg-[#DCEDDD] px-2 py-0.5 text-[0.6875rem] font-bold text-[#216A2B]">
              Primær foresatt
            </span>
          ) : null}
          <TeacherBadge>
            <span className="rounded-full bg-[#E4EEF8] px-2 py-0.5 text-[0.6875rem] font-bold text-[#245D84]">
              Lærer
            </span>
          </TeacherBadge>
        </span>
        <span className="block text-xs font-semibold text-admin-muted">
          {guardian.role}
        </span>
      </span>
    </>
  );

  return (
    <TeacherRole isTeacher={guardian.isTeacher ?? false}>
      <li className="grid gap-2 py-4 first:pt-0 last:pb-0">
        {guardian.href ? (
          <Link
            href={guardian.href}
            className="flex min-w-0 gap-3 rounded-xl outline-none transition-colors hover:bg-[#F7F6F1] focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {identity}
          </Link>
        ) : (
          <div className="flex min-w-0 gap-3">{identity}</div>
        )}
        {guardian.phone || guardian.email ? (
          <div className="grid min-w-0 pl-[3.25rem] text-sm">
            {guardian.phone ? (
              <a href={telHref(guardian.phone)} className={contactLinkClass}>
                <Phone aria-hidden="true" className="size-4 shrink-0" />
                {guardian.phone}
              </a>
            ) : null}
            {guardian.email ? (
              <a
                href={`mailto:${guardian.email}`}
                className={cn(contactLinkClass, "min-w-0")}
              >
                <Mail aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">{guardian.email}</span>
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 pl-[3.25rem] text-xs">
          {guardian.email ? (
            <SendLoginLinkButton guardianId={guardian.id} email={guardian.email} />
          ) : null}
          <TeacherToggleButton
            guardianId={guardian.id}
            name={guardian.name}
            isTeacher={guardian.isTeacher ?? false}
          />
          {removable ? (
            <RemoveGuardianButton
              familyId={familyId}
              guardianId={guardian.id}
              name={guardian.name}
            />
          ) : null}
        </div>
      </li>
    </TeacherRole>
  );
}

function NextActionBanner({
  action,
  id,
}: {
  action: FamilyNextAction;
  id: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "flex flex-col gap-3 rounded-2xl p-4 ring-1 sm:flex-row sm:items-center sm:gap-5 sm:p-5",
        nextActionClasses[action.tone],
      )}
    >
      <div className="min-w-0 flex-1">
        <h2 id={id} className="font-bold">
          <span className="sr-only">Neste handling: </span>
          {action.title}
        </h2>
        <p className="mt-0.5 text-sm text-admin-muted">{action.description}</p>
      </div>
      {action.control ? (
        <div className="sm:shrink-0">{action.control}</div>
      ) : (
        <Link
          href={action.href}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#E9B63B] px-4 text-sm font-bold text-[#392B08] outline-none transition-colors hover:bg-[#DDA726] focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-auto sm:shrink-0"
        >
          {action.label}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      )}
    </section>
  );
}

export function FamilyWorkbench({
  family,
  tabs,
  activeTab,
  editFamilyHref,
  addGuardianHref,
  addChildHref,
  editRelationshipsHref,
  nextAction,
  recentActivity,
  historyHref,
  attentionItems = [],
  allAttentionHref,
  duplicateFamilies = [],
  mergeOptions = [],
  paymentStatus,
  economy,
  economySetup,
  paymentHistory,
}: FamilyWorkbenchProps) {
  const primaryGuardian =
    family.guardians.find((guardian) => guardian.isPrimary) ??
    family.guardians[0];
  const economyAction = nextAction?.inEconomy && economy ? nextAction : null;
  const bannerAction = nextAction && !economyAction ? nextAction : null;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-5">
      <header className="flex items-start gap-3">
        <h1 className="min-w-0 flex-1 wrap-anywhere text-balance font-heading text-[1.875rem] leading-tight font-bold tracking-[-0.02em] sm:text-[2.25rem]">
          {family.name}
        </h1>
        {editFamilyHref || mergeOptions.length > 0 ? <FamilyActionsMenu familyId={family.id} familyName={family.name} editHref={editFamilyHref} options={mergeOptions} /> : null}
      </header>

      <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(18rem,1fr)]">
        <section
          aria-labelledby={`family-children-${family.id}`}
          className={panelClass}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id={`family-children-${family.id}`} className={panelTitleClass}>
              Barn ({family.children.length})
            </h2>
            <div className="flex min-w-0 max-w-full flex-wrap gap-2">
              <ChildMergeDialog
                options={family.children.map((child) => ({
                  id: child.id.startsWith("application-")
                    ? child.id.slice(12)
                    : child.id,
                  type: child.id.startsWith("application-")
                    ? "application"
                    : "student",
                  name: child.name,
                  description: `${child.description ?? ""} · ${child.placement.value} · ${child.payment.value}`,
                }))}
              />
              {addChildHref ? (
                <Link href={addChildHref} className={secondaryLinkClass}>
                  <GraduationCap aria-hidden="true" className="size-4" />
                  Legg til barn
                </Link>
              ) : null}
            </div>
          </div>
          {family.children.length === 0 ? (
            <p className="mt-4 rounded-xl bg-[#F7F6F1] px-4 py-5 text-sm text-admin-muted">
              Ingen barn er knyttet til familien.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[#ECE8DF]">
              {family.children.map((child) => (
                <li key={child.id}>
                  <Link
                    href={child.href}
                    className="group -mx-2 flex min-w-0 items-start gap-3 rounded-xl px-2 py-4 outline-none transition-colors hover:bg-[#FBFAF6] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FEEDCA] font-heading text-sm font-bold text-[#775108]">
                      {initials(child.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <span className="min-w-0">
                          <span className="block wrap-anywhere font-bold">{child.name}</span>
                          {child.description ? (
                            <span className="block text-xs text-admin-muted">
                              {child.description}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="sr-only">Betaling</span>
                          <StatusBadge fact={child.payment} />
                        </span>
                      </span>
                      {child.payment.detail ? (
                        <span className="mt-1 block text-xs text-admin-muted">
                          {child.payment.detail}
                        </span>
                      ) : null}
                      <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                        <InlineFact label="Klasse" fact={child.placement} />
                        {child.admission.tone !== "success" ? (
                          <InlineFact label="Opptak" fact={child.admission} />
                        ) : null}
                        {child.enrollment.tone !== "success" ? (
                          <InlineFact label="Deltakelse" fact={child.enrollment} />
                        ) : null}
                        <div className="flex items-center gap-1.5">
                          <dt className="text-admin-muted">Kontingent</dt>
                          <dd className="font-semibold tabular-nums">
                            {child.feeAmountOre == null
                              ? "Ikke fastsatt"
                              : formatNok(child.feeAmountOre)}
                          </dd>
                        </div>
                      </dl>
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      className="mt-2.5 size-5 shrink-0 text-admin-muted transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby={`family-guardians-${family.id}`}
          className={panelClass}
        >
          <h2 id={`family-guardians-${family.id}`} className={panelTitleClass}>
            Foresatte
          </h2>
          {family.guardians.length === 0 ? (
            <p className="mt-3 text-sm text-admin-muted">
              Ingen foresatte er registrert.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[#ECE8DF]">
              {family.guardians.map((guardian) => (
                <GuardianItem
                  key={guardian.id}
                  familyId={family.id}
                  guardian={guardian}
                  removable={family.guardians.length > 1}
                />
              ))}
            </ul>
          )}
          {addGuardianHref ? (
            <Link
              href={addGuardianHref}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#CFC8BA] px-3 text-sm font-bold text-[#277A31] outline-none transition-colors hover:border-[#8DB793] hover:bg-[#F7FBF7] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <UserRound aria-hidden="true" className="size-4" />
              Legg til foresatt
            </Link>
          ) : null}
        </section>

        {paymentStatus ? (
          <section aria-labelledby={`family-payment-status-${family.id}`} className={cn(panelClass, "lg:col-span-2")}>
            <h2 id={`family-payment-status-${family.id}`} className={panelTitleClass}>Betalingsstatus {family.schoolYearLabel}</h2>
            <div className="mt-4">{paymentStatus}</div>
          </section>
        ) : null}
      </div>

      {duplicateFamilies.length > 0 ? (
        <section
          aria-labelledby={`family-duplicates-${family.id}`}
          className="rounded-2xl bg-[#FFF8E9] p-4 ring-1 ring-[#EDD49A] sm:p-5"
        >
          <h2
            id={`family-duplicates-${family.id}`}
            className="flex items-center gap-2 font-bold"
          >
            <CircleAlert aria-hidden="true" className="size-4 text-[#775108]" />
            Mulig duplikat
          </h2>
          <p className="mt-1 text-sm text-[#6D5A2D]">
            Samme opplysninger finnes i en annen familie. Sammenlign før du
            registrerer betaling eller søskenrabatt, og flytt barn og
            foresatte til én familie.
          </p>
          <ul className="mt-3 grid gap-2 lg:grid-cols-2">
            {duplicateFamilies.map((duplicate) => (
              <li key={duplicate.id} className="flex items-center gap-2">
                <Link
                  href={duplicate.href}
                  className="group flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm outline-none ring-1 ring-[#EDD49A] transition-colors hover:bg-[#FFFDF7] focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{duplicate.name}</span>
                    <span className="block text-xs text-admin-muted">
                      {duplicate.reasons.join(", ")}
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-admin-muted transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
                <MergeDuplicateButton
                  keepFamilyId={family.id}
                  mergeFamilyId={duplicate.id}
                  mergeFamilyName={duplicate.name}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {bannerAction ? (
        <NextActionBanner action={bannerAction} id={`next-action-${family.id}`} />
      ) : null}

      {tabs.length > 1 ? (
        <nav
          aria-label="Familieopplysninger"
          className="overflow-x-auto border-b border-[#ECE8DF]"
        >
          <ul className="flex min-w-max gap-1">
            {tabs.map((tab) => (
              <li key={tab.id}>
                <Link
                  href={tab.href}
                  aria-current={activeTab === tab.id ? "page" : undefined}
                  className="relative inline-flex min-h-11 items-center px-3 text-sm font-bold text-admin-muted outline-none transition-colors hover:text-foreground focus-visible:rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:text-[#277A31] aria-[current=page]:after:absolute aria-[current=page]:after:right-3 aria-[current=page]:after:bottom-0 aria-[current=page]:after:left-3 aria-[current=page]:after:h-0.5 aria-[current=page]:after:bg-[#3C8F44]"
                >
                  {tab.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(18rem,1fr)]">
        <div className="grid min-w-0 grid-cols-1 gap-5">
          {economy ? (
            <section
              id="family-economy"
              aria-labelledby={`family-economy-${family.id}`}
              className={cn(
                panelClass,
                economyAction ? "ring-[#F1C7C3]" : undefined,
              )}
            >
              <h2 id={`family-economy-${family.id}`} className={panelTitleClass}>
                Økonomi {family.schoolYearLabel}
              </h2>
              {economyAction ? (
                <p className="mt-0.5 text-sm font-semibold text-[#8B2F2B]">
                  <span className="sr-only">{economyAction.title}: </span>
                  {economyAction.description}
                </p>
              ) : null}
              <div className="mt-4">{economy}</div>
            </section>
          ) : null}

          {paymentHistory}

          {economySetup ? (
            <section
              aria-label="Betalingsplan og rabatter"
              className="rounded-2xl bg-white px-5 ring-1 ring-[#E3DED3] sm:px-6"
            >
              {economySetup}
            </section>
          ) : null}
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-5">
          <section
            aria-labelledby={`family-info-${family.id}`}
            className={panelClass}
          >
            <h2 id={`family-info-${family.id}`} className={panelTitleClass}>
              Familieinformasjon
            </h2>
            <dl className="mt-3 divide-y divide-[#ECE8DF] text-sm">
              {family.status ? <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2.5"><dt className="text-admin-muted">Status</dt><dd><StatusBadge fact={family.status} /></dd></div> : null}
              {family.updatedAt ? <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2.5"><dt className="text-admin-muted">Sist oppdatert</dt><dd className="font-semibold">{formatTimestamp(family.updatedAt)}</dd></div> : null}
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2.5">
                <dt className="text-admin-muted">Primær kontakt</dt>
                <dd className="font-semibold">
                  {primaryGuardian?.name ?? "Ikke registrert"}
                </dd>
              </div>
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2.5">
                <dt className="text-admin-muted">Hjemmeadresse</dt>
                <dd className="font-semibold">
                  {family.address || "Ikke registrert"}
                </dd>
              </div>
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2.5">
                <dt className="text-admin-muted">Familiespråk</dt>
                <dd className="font-semibold">
                  {family.language ?? "Ikke registrert"}
                </dd>
              </div>
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2.5">
                <dt className="text-admin-muted">Skoleår</dt>
                <dd className="font-semibold">
                  {family.schoolYearLabel ?? "Ikke valgt"}
                </dd>
              </div>
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2.5">
                <dt className="text-admin-muted">Kontingent totalt</dt>
                <dd className="font-semibold tabular-nums">
                  {family.totalFeeOre == null
                    ? "Ikke fastsatt"
                    : formatNok(family.totalFeeOre)}
                </dd>
              </div>
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2.5">
                <dt className="text-admin-muted">Fordeling</dt>
                <dd>
                  {family.allocations?.length ? (
                    <ul className="grid gap-1">
                      {family.allocations.map((allocation) => (
                        <li
                          key={allocation.childId}
                          className="flex justify-between gap-3"
                        >
                          <span className="min-w-0 truncate">
                            {allocation.childName}
                          </span>
                          <span className="font-semibold tabular-nums">
                            {formatNok(allocation.amountOre)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="font-semibold">Ikke fordelt</span>
                  )}
                </dd>
              </div>
            </dl>
            {family.relationshipNote ? (
              <div className="mt-4 grid gap-3 rounded-xl bg-[#EEF7FE] p-4 ring-1 ring-[#BFDDF2]">
                <div className="flex gap-3">
                  <CircleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-[#347BA8]"
                  />
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold">Familierelasjon</h3>
                    <p className="mt-0.5 text-sm text-[#36586E]">
                      {family.relationshipNote}
                    </p>
                  </div>
                </div>
                {editRelationshipsHref ? (
                  <Link
                    href={editRelationshipsHref}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#BFD1DD] bg-white px-3 text-sm font-bold outline-none transition-colors hover:bg-[#F7FBFD] focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    Rediger relasjoner
                  </Link>
                ) : null}
              </div>
            ) : null}
          </section>

          <section
            aria-labelledby={`activity-${family.id}`}
            className={panelClass}
          >
            <h2 id={`activity-${family.id}`} className={panelTitleClass}>
              Nylig aktivitet
            </h2>
            {recentActivity.length === 0 ? (
              <p className="mt-3 text-sm text-admin-muted">
                Ingen aktivitet er registrert.
              </p>
            ) : (
              <ol className="relative mt-3 grid gap-1 before:absolute before:top-5 before:bottom-5 before:left-5 before:w-px before:bg-[#D9D3C7]">
                {recentActivity.map((activity) => {
                  const Icon = activityIcons[activity.kind];
                  return (
                    <li key={activity.id} className="relative flex gap-3 py-2">
                      <span className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-4 border-white bg-[#F0F0ED] text-admin-muted">
                        <Icon aria-hidden="true" className="size-4" />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <p className="text-sm font-bold">{activity.title}</p>
                        {activity.description ? (
                          <p className="mt-0.5 text-xs text-admin-muted">
                            {activity.description}
                          </p>
                        ) : null}
                        <time
                          dateTime={activity.occurredAt}
                          className="mt-1 block text-[0.6875rem] text-admin-muted"
                        >
                          {formatTimestamp(activity.occurredAt)}
                        </time>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {historyHref ? (
              <Link href={historyHref} className={cn(secondaryLinkClass, "mt-4")}>
                Se hele historikken
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            ) : null}
          </section>
        </div>
      </div>

      {attentionItems.length > 0 ? (
        <section
          aria-labelledby={`school-attention-${family.id}`}
          className={panelClass}
        >
          <div className="flex items-center justify-between gap-4">
            <h2 id={`school-attention-${family.id}`} className={panelTitleClass}>
              På tvers av skolen
            </h2>
            {allAttentionHref ? (
              <Link
                href={allAttentionHref}
                className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-bold whitespace-nowrap text-[#277A31] outline-none hover:bg-[#F2F7F2] focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Se alle
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            ) : null}
          </div>
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {attentionItems.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="group flex min-h-[4.75rem] items-center gap-3 rounded-xl border border-[#E8E3D9] px-4 py-3 outline-none transition-colors hover:bg-[#FBFAF6] focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full font-heading font-bold",
                      statusClasses[item.tone],
                    )}
                  >
                    {item.count ?? (
                      <CircleAlert aria-hidden="true" className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{item.title}</span>
                    <span className="block truncate text-xs text-admin-muted">
                      {item.description}
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-admin-muted transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
