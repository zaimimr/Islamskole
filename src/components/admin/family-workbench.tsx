import Link from "next/link";
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  CircleAlert,
  CircleUserRound,
  Clock3,
  GraduationCap,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ReceiptText,
  UserRound,
  Users,
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
  FamilyPickerDialog,
  MergeDuplicateButton,
  RemoveGuardianButton,
  type FamilyOption,
} from "@/app/[locale]/admin/familier/family-controls";
import { mergeFamilies } from "@/app/[locale]/admin/familier/families-actions";
import { ChildMergeDialog } from "@/app/[locale]/admin/familier/child-merge-dialog";

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
};

export type FamilyWorkbenchProps = {
  family: {
    id: string;
    name: string;
    status?: FamilyFact;
    updatedAt?: string;
    address?: string;
    phone?: string;
    email?: string;
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
  "inline-flex min-h-11 items-center gap-2 rounded-lg font-semibold text-[#277A31] underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 xl:min-h-0";

function Fact({ label, fact }: { label: string; fact: FamilyFact }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] font-bold tracking-[0.04em] text-admin-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 flex items-center gap-2 text-sm font-bold">
        <span
          aria-hidden="true"
          className={cn(
            "size-2 shrink-0 rounded-full",
            statusDotClasses[fact.tone],
          )}
        />
        <span className="truncate">{fact.value}</span>
      </dd>
      {fact.detail ? (
        <dd className="mt-0.5 truncate pl-4 text-xs text-admin-muted">
          {fact.detail}
        </dd>
      ) : null}
    </div>
  );
}

function RelationshipMember({
  name,
  role,
  href,
  phone,
  email,
  loginGuardianId,
  removeFromFamilyId,
  isPrimary = false,
  isTeacher = false,
  child = false,
}: {
  loginGuardianId?: string;
  removeFromFamilyId?: string;
  isTeacher?: boolean;
  name: string;
  role: string;
  href?: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
  child?: boolean;
}) {
  const content = (
    <>
      <span
        className={cn(
          "relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-4 border-white font-heading text-sm font-bold",
          child ? "bg-[#DDEEF9] text-[#245D84]" : "bg-[#DCEDDD] text-[#216A2B]",
        )}
      >
        {initials(name) || (
          <CircleUserRound aria-hidden="true" className="size-5" />
        )}
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-bold">{name}</span>
          {isPrimary ? (
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
        <span className="mt-0.5 block text-xs font-semibold text-admin-muted">
          {role}
        </span>
      </span>
    </>
  );

  return (
    <TeacherRole isTeacher={isTeacher}>
      <li className="relative grid gap-1 py-2">
        {href ? (
          <Link
            href={href}
            className="flex min-w-0 flex-1 gap-3 rounded-xl outline-none transition-colors hover:bg-[#F7F6F1] focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {content}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 gap-3">{content}</div>
        )}
        {phone || email || loginGuardianId ? (
          <div className="grid min-w-0 pl-[3.25rem] text-xs">
            {phone ? (
              <a href={telHref(phone)} className={contactLinkClass}>
                <Phone aria-hidden="true" className="size-3.5 shrink-0" />
                {phone}
              </a>
            ) : null}
            {email ? (
              <a href={`mailto:${email}`} className={cn(contactLinkClass, "min-w-0")}>
                <Mail aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">{email}</span>
              </a>
            ) : null}
            {loginGuardianId && email ? (
              <SendLoginLinkButton
                guardianId={loginGuardianId}
                email={email}
                className="mt-1 justify-self-start"
              />
            ) : null}
            {loginGuardianId ? (
              <TeacherToggleButton
                guardianId={loginGuardianId}
                name={name}
                isTeacher={isTeacher}
                className="justify-self-start"
              />
            ) : null}
            {loginGuardianId && removeFromFamilyId ? (
              <RemoveGuardianButton
                familyId={removeFromFamilyId}
                guardianId={loginGuardianId}
                name={name}
                className="justify-self-start"
              />
            ) : null}
          </div>
        ) : null}
      </li>
    </TeacherRole>
  );
}

function NextActionCard({ action }: { action?: FamilyNextAction }) {
  if (!action) {
    return (
      <div className="mt-3 flex gap-3 rounded-xl bg-[#F2F8F2] p-4 text-[#216A2B] ring-1 ring-[#C9E0CB]">
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-bold">Ingen åpen handling</p>
          <p className="mt-0.5 text-sm text-[#356C3B]">
            Familien har ingen registrerte avvik.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-3 rounded-xl p-4 ring-1",
        nextActionClasses[action.tone],
      )}
    >
      <h3 className="font-bold">{action.title}</h3>
      <p className="mt-1 text-sm text-admin-muted">{action.description}</p>
      <Link
        href={action.href}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#E9B63B] px-3 text-sm font-bold text-[#392B08] outline-none transition-colors hover:bg-[#DDA726] focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {action.label}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
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
}: FamilyWorkbenchProps) {
  const primaryGuardian =
    family.guardians.find((guardian) => guardian.isPrimary) ??
    family.guardians[0];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(14rem,0.72fr)_minmax(0,2.25fr)_minmax(15rem,0.82fr)]">
      <aside className="order-3 rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3] xl:order-1">
        <h2 className="text-balance font-heading text-2xl font-bold">
          {family.name}
        </h2>
        <address className="mt-5 grid gap-3 not-italic">
          {family.address ? (
            <p className="flex gap-3 text-sm text-admin-muted">
              <MapPin
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-[#3C8F44]"
              />
              <span>{family.address}</span>
            </p>
          ) : null}
          {family.phone ? (
            <a href={telHref(family.phone)} className={cn(contactLinkClass, "text-sm")}>
              <Phone aria-hidden="true" className="size-4 shrink-0" />
              {family.phone}
            </a>
          ) : null}
          {family.email ? (
            <a
              href={`mailto:${family.email}`}
              className={cn(contactLinkClass, "min-w-0 text-sm")}
            >
              <Mail aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0 break-words">{family.email}</span>
            </a>
          ) : null}
        </address>

        <div className="my-5 h-px bg-[#ECE8DF]" />

        <h3 className="font-heading text-base font-bold">Foresatte og barn</h3>
        {family.guardians.length === 0 && family.children.length === 0 ? (
          <p className="mt-3 text-sm text-admin-muted">
            Ingen relasjoner er registrert.
          </p>
        ) : (
          <ul className="relative mt-2 grid gap-1 before:absolute before:top-5 before:bottom-5 before:left-5 before:w-px before:bg-[#D9D3C7]">
            {family.guardians.map((guardian) => (
              <RelationshipMember
                key={guardian.id}
                name={guardian.name}
                role={guardian.role}
                href={guardian.href}
                isPrimary={guardian.isPrimary}
                phone={guardian.phone}
                email={guardian.email}
                loginGuardianId={guardian.id}
                removeFromFamilyId={
                  family.guardians.length > 1 ? family.id : undefined
                }
                isTeacher={guardian.isTeacher}
              />
            ))}
            {family.children.map((child) => (
              <RelationshipMember
                key={child.id}
                name={child.name}
                role={child.description ?? "Elev"}
                href={child.href}
                child
              />
            ))}
          </ul>
        )}

        {addGuardianHref ? (
          <Link
            href={addGuardianHref}
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#CFC8BA] px-3 text-sm font-bold text-[#277A31] outline-none transition-colors hover:border-[#8DB793] hover:bg-[#F7FBF7] focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <UserRound aria-hidden="true" className="size-4" />
            Legg til foresatt
          </Link>
        ) : null}
        {addChildHref ? (
          <Link
            href={addChildHref}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#CFC8BA] px-3 text-sm font-bold text-[#277A31] outline-none transition-colors hover:border-[#8DB793] hover:bg-[#F7FBF7] focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <GraduationCap aria-hidden="true" className="size-4" />
            Legg til barn
          </Link>
        ) : null}
      </aside>

      <section className="order-1 overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3] xl:order-2">
        <header className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-balance font-heading text-[1.875rem] leading-tight font-bold tracking-[-0.02em]">
                {family.name}
              </h1>
              {family.status ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
                    statusClasses[family.status.tone],
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2 rounded-full",
                      statusDotClasses[family.status.tone],
                    )}
                  />
                  {family.status.value}
                </span>
              ) : null}
            </div>
            {family.updatedAt ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-admin-muted">
                <Clock3 aria-hidden="true" className="size-3.5" />
                Sist oppdatert {formatTimestamp(family.updatedAt)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {editFamilyHref ? (
              <Link
                href={editFamilyHref}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DDD8CE] px-3 text-sm font-bold outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Pencil aria-hidden="true" className="size-4" />
                Rediger familie
              </Link>
            ) : null}
            {mergeOptions.length > 0 ? (
              <FamilyPickerDialog
                triggerLabel="Slå sammen med annen familie"
                title={`Slå sammen med ${family.name}`}
                description="Barn, foresatte, betalingsplaner og innmeldinger fra familien du velger flyttes hit. Foresatte med samme e-post blir én person, og den andre familien slettes."
                confirmLabel="Slå sammen"
                successMessage="Familiene er slått sammen"
                options={mergeOptions}
                action={mergeFamilies.bind(null, family.id)}
              />
            ) : null}
          </div>
        </header>

        <section
          className="px-5 pt-5 sm:px-6 xl:hidden"
          aria-labelledby={`mobile-next-action-${family.id}`}
        >
          <h2
            id={`mobile-next-action-${family.id}`}
            className="font-heading text-lg font-bold"
          >
            Neste handling
          </h2>
          <NextActionCard action={nextAction} />
        </section>

        {tabs.length > 1 ? (
        <nav
          aria-label="Familieopplysninger"
          className="mt-5 overflow-x-auto border-b border-[#ECE8DF] px-3 sm:px-5"
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

        <div className="grid gap-6 p-5 sm:p-6">
          {duplicateFamilies.length > 0 ? (
            <section
              aria-labelledby={`family-duplicates-${family.id}`}
              className="rounded-xl bg-[#FFF8E9] p-4 ring-1 ring-[#EDD49A]"
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
              <ul className="mt-3 grid gap-2">
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
          <section aria-labelledby={`family-info-${family.id}`}>
            <h2
              id={`family-info-${family.id}`}
              className="font-heading text-lg font-bold"
            >
              Familieinformasjon
            </h2>
            <dl className="mt-4 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-admin-muted">Hjemmeadresse</dt>
                <dd className="mt-0.5 font-semibold">
                  {family.address ?? "Ikke registrert"}
                </dd>
              </div>
              <div>
                <dt className="text-admin-muted">E-post</dt>
                <dd className="mt-0.5 break-words font-semibold">
                  {family.email ? (
                    <a href={`mailto:${family.email}`} className={contactLinkClass}>
                      {family.email}
                    </a>
                  ) : (
                    "Ikke registrert"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-admin-muted">Primær kontakt</dt>
                <dd className="mt-0.5 font-semibold">
                  {primaryGuardian?.name ?? "Ikke registrert"}
                  {primaryGuardian?.phone ? (
                    <>
                      {", "}
                      <a href={telHref(primaryGuardian.phone)} className={contactLinkClass}>
                        {primaryGuardian.phone}
                      </a>
                    </>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-admin-muted">Familiespråk</dt>
                <dd className="mt-0.5 font-semibold">
                  {family.language ?? "Ikke registrert"}
                </dd>
              </div>
            </dl>
          </section>

          <section
            aria-labelledby={`family-children-${family.id}`}
            className="border-t border-[#ECE8DF] pt-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                id={`family-children-${family.id}`}
                className="font-heading text-lg font-bold"
              >
                Barn ({family.children.length})
              </h2>
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
            </div>
            {family.children.length === 0 ? (
              <p className="mt-3 rounded-xl bg-[#F7F6F1] px-4 py-5 text-sm text-admin-muted">
                Ingen barn er knyttet til familien.
              </p>
            ) : (
              <ul className="mt-3 overflow-hidden rounded-xl border border-[#E8E3D9]">
                {family.children.map((child) => (
                  <li
                    key={child.id}
                    className="border-b border-[#ECE8DF] last:border-b-0"
                  >
                    <Link
                      href={child.href}
                      className="group block px-4 py-4 outline-none transition-colors hover:bg-[#FBFAF6] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FEEDCA] font-heading text-sm font-bold text-[#775108]">
                          {initials(child.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-3">
                            <span>
                              <span className="block font-bold">
                                {child.name}
                              </span>
                              {child.description ? (
                                <span className="block text-xs text-admin-muted">
                                  {child.description}
                                </span>
                              ) : null}
                            </span>
                            <ArrowRight
                              aria-hidden="true"
                              className="size-5 text-admin-muted transition-transform group-hover:translate-x-0.5"
                            />
                          </span>
                          <dl className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-4">
                            <Fact label="Opptak" fact={child.admission} />
                            <Fact label="Plassering" fact={child.placement} />
                            <Fact label="Deltakelse" fact={child.enrollment} />
                            <div className="min-w-0">
                              <dt className="text-[0.6875rem] font-bold tracking-[0.04em] text-admin-muted uppercase">
                                Kontingent
                              </dt>
                              <dd className="mt-1 text-sm font-bold tabular-nums">
                                {child.feeAmountOre == null
                                  ? "Ikke fastsatt"
                                  : formatNok(child.feeAmountOre)}
                              </dd>
                            </div>
                            <Fact label="Betaling" fact={child.payment} />
                          </dl>
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            aria-label="Kontingent for familien"
            className="grid gap-4 rounded-xl bg-[#FAF9F5] p-4 sm:grid-cols-3"
          >
            <div className="flex gap-3">
              <CalendarRange
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-[#3C8F44]"
              />
              <div>
                <p className="text-xs text-admin-muted">Skoleår</p>
                <p className="mt-0.5 font-bold">
                  {family.schoolYearLabel ?? "Ikke valgt"}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Wallet
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-[#3C8F44]"
              />
              <div>
                <p className="text-xs text-admin-muted">Kontingent totalt</p>
                <p className="mt-0.5 font-bold tabular-nums">
                  {family.totalFeeOre == null
                    ? "Ikke fastsatt"
                    : formatNok(family.totalFeeOre)}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Users
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-[#3C8F44]"
              />
              <div>
                <p className="text-xs text-admin-muted">Fordeling</p>
                {family.allocations?.length ? (
                  <ul className="mt-0.5 grid gap-0.5 text-xs">
                    {family.allocations.map((allocation) => (
                      <li
                        key={allocation.childId}
                        className="flex justify-between gap-3"
                      >
                        <span>{allocation.childName}</span>
                        <span className="font-bold tabular-nums">
                          {formatNok(allocation.amountOre)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 font-bold">Ikke fordelt</p>
                )}
              </div>
            </div>
          </section>

          {family.relationshipNote ? (
            <section className="flex flex-col gap-3 rounded-xl bg-[#EEF7FE] p-4 ring-1 ring-[#BFDDF2] sm:flex-row sm:items-center">
              <CircleAlert
                aria-hidden="true"
                className="size-5 shrink-0 text-[#347BA8]"
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold">Familierelasjon</h2>
                <p className="mt-0.5 text-sm text-[#36586E]">
                  {family.relationshipNote}
                </p>
              </div>
              {editRelationshipsHref ? (
                <Link
                  href={editRelationshipsHref}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-[#BFD1DD] bg-white px-3 text-sm font-bold outline-none transition-colors hover:bg-[#F7FBFD] focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  Rediger relasjoner
                </Link>
              ) : null}
            </section>
          ) : null}
        </div>
      </section>

      <aside className="order-2 rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3] xl:order-3">
        <h2 className="hidden font-heading text-xl font-bold xl:block">
          Neste og nylig
        </h2>

        <section
          className="mt-5 hidden xl:block"
          aria-labelledby={`next-action-${family.id}`}
        >
          <h3 id={`next-action-${family.id}`} className="text-sm font-bold">
            Neste handling
          </h3>
          <NextActionCard action={nextAction} />
        </section>

        <section
          className="xl:mt-6 xl:border-t xl:border-[#ECE8DF] xl:pt-5"
          aria-labelledby={`activity-${family.id}`}
        >
          <h3
            id={`activity-${family.id}`}
            className="font-heading text-lg font-bold xl:font-sans xl:text-sm"
          >
            Nylig aktivitet
          </h3>
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
            <Link
              href={historyHref}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DDD8CE] px-3 text-sm font-bold outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Se hele historikken
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
        </section>
      </aside>

      {attentionItems.length > 0 ? (
        <section
          aria-labelledby={`school-attention-${family.id}`}
          className="order-4 rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3] xl:col-span-3"
        >
          <div className="flex items-center justify-between gap-4">
            <h2
              id={`school-attention-${family.id}`}
              className="font-heading text-lg font-bold"
            >
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
                    <span className="block text-sm font-bold">
                      {item.title}
                    </span>
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
