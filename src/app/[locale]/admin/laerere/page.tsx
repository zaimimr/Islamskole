import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import {
  CalendarX2,
  ChevronDown,
  CircleCheck,
  GraduationCap,
  Mail,
  MessageSquareText,
  Phone,
  Search,
  UserCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { deleteTeacherApplication } from "@/app/[locale]/admin/actions";
import { adminBasePath } from "@/components/admin/paths";
import { TeacherStatusSelect } from "@/components/admin/teacher-status-select";
import { TeacherRegisterDialog } from "@/components/admin/teacher-register-dialog";
import { isPlaceholderEmail } from "@/lib/portal/emails";
import { formatNok } from "@/lib/money";
import { formatOsloDate, formatOsloDateTime } from "@/lib/dates";
import { Pagination } from "@/components/admin/pagination";
import {
  FilterSkeleton,
  ListCardSkeleton,
} from "@/components/admin/admin-skeletons";
import { ExportButton } from "@/components/admin/export-button";
import { EmptyState } from "@/components/admin/empty-state";
import { OptimisticRemovalList } from "@/components/admin/optimistic-removal-list";
import { TeacherRowMenu } from "./teacher-row-menu";
import { StatusPill } from "@/components/admin/status-pill";
import { NoticeBadge } from "@/components/admin/notice-badge";
import {
  BulkActions,
  BulkSelectAll,
  BulkRowCheckbox,
} from "@/components/admin/bulk-actions";
import { RowActions } from "@/components/ui/row-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Lærere" };

const statusItems = [
  { value: "aktive", label: "Aktive søknader" },
  { value: "alle", label: "Alle statuser" },
  { value: "ny", label: "Ny" },
  { value: "kontaktet", label: "Kontaktet" },
  { value: "arkivert", label: "Arkivert" },
];

type TeacherApplicationRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  subjects: string | null;
  message: string | null;
  status: string | null;
  created_at: string | null;
};

const PAGE_SIZE = 25;

async function getApplications(
  page: number,
  q: string,
  status: string,
): Promise<{ rows: TeacherApplicationRow[]; total: number }> {
  try {
    const supabase = await createClient();
    const from = (page - 1) * PAGE_SIZE;
    let query = supabase
      .from("teacher_applications")
      .select(
        "id, full_name, email, phone, subjects, message, status, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });
    const term = q.replace(/[%,()]/g, " ").trim();
    if (term) {
      query = query.or(
        `full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,subjects.ilike.%${term}%`,
      );
    }
    if (status === "aktive") query = query.neq("status", "arkivert");
    else if (status !== "alle") query = query.eq("status", status);
    const { data, count } = await query.range(from, from + PAGE_SIZE - 1);
    return {
      rows: (data as TeacherApplicationRow[] | null) ?? [],
      total: count ?? 0,
    };
  } catch {
    return { rows: [], total: 0 };
  }
}

async function getApplicationCounts() {
  try {
    const supabase = await createClient();
    const [all, fresh, contacted] = await Promise.all([
      supabase
        .from("teacher_applications")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("teacher_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "ny"),
      supabase
        .from("teacher_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "kontaktet"),
    ]);
    return {
      all: all.count ?? 0,
      fresh: fresh.count ?? 0,
      contacted: contacted.count ?? 0,
    };
  } catch {
    return { all: 0, fresh: 0, contacted: 0 };
  }
}

function formatDate(value: string | null) {
  return formatOsloDateTime(value) || "-";
}

type TeacherRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  teacher_note: string | null;
  teacher_suspended_at: string | null;
  teacher_suspended_reason: string | null;
  teacher_suspended_by: string | null;
};

type TeacherAbsence = { id: string; date: string; notified: boolean; reason: string | null };

async function getRegisteredTeachers(): Promise<{
  teachers: TeacherRow[];
  familyByGuardian: Map<string, string>;
  giftTotals: Map<string, { amount: number; students: number }>;
  classesByGuardian: Map<string, { id: string; name: string }[]>;
  absencesByGuardian: Map<string, TeacherAbsence[]>;
}> {
  try {
    const supabase = await createClient();
    const { data: activeYear } = await supabase
      .from("school_years")
      .select("id")
      .eq("is_active", true)
      .maybeSingle();
    const [teacherResult, linkResult, giftResult, assignmentResult, absenceResult] = await Promise.all([
      supabase
        .from("guardians")
        .select(
          "id, first_name, last_name, email, phone, teacher_note, teacher_suspended_at, teacher_suspended_reason, teacher_suspended_by",
        )
        .eq("is_teacher", true)
        .order("first_name", { ascending: true }),
      supabase.from("family_guardians").select("guardian_id, family_id"),
      supabase
        .from("teacher_gift_report")
        .select("teacher_guardian_id, student_count, total_amount"),
      activeYear
        ? supabase
            .from("class_teachers")
            .select("guardian_id, classes(id, name_no, sort_order)")
            .eq("school_year_id", activeYear.id)
        : Promise.resolve({ data: [], error: null }),
      activeYear
        ? supabase
            .from("teacher_absences")
            .select("id, guardian_id, notified, reason, school_day:school_days!inner(date, school_year_id)")
            .eq("school_day.school_year_id", activeYear.id)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const absencesByGuardian = new Map<string, TeacherAbsence[]>();
    for (const row of (absenceResult.data as
      | {
          id: string;
          guardian_id: string;
          notified: boolean;
          reason: string | null;
          school_day: { date: string } | null;
        }[]
      | null) ?? []) {
      if (!row.school_day) continue;
      const list = absencesByGuardian.get(row.guardian_id) ?? [];
      list.push({ id: row.id, date: row.school_day.date, notified: row.notified, reason: row.reason });
      absencesByGuardian.set(row.guardian_id, list.sort((left, right) => right.date.localeCompare(left.date)));
    }

    const classesByGuardian = new Map<string, { id: string; name: string }[]>();
    for (const row of ((assignmentResult.data as
      | {
          guardian_id: string;
          classes: { id: string; name_no: string | null; sort_order: number | null } | null;
        }[]
      | null) ?? []
    ).sort(
      (left, right) =>
        (left.classes?.sort_order ?? 0) - (right.classes?.sort_order ?? 0),
    )) {
      if (!row.classes) continue;
      const list = classesByGuardian.get(row.guardian_id) ?? [];
      list.push({ id: row.classes.id, name: row.classes.name_no ?? "Klasse" });
      classesByGuardian.set(row.guardian_id, list);
    }

    const familyByGuardian = new Map<string, string>();
    for (const row of (linkResult.data as
      { guardian_id: string; family_id: string }[] | null) ?? []) {
      if (!familyByGuardian.has(row.guardian_id)) {
        familyByGuardian.set(row.guardian_id, row.family_id);
      }
    }

    const giftTotals = new Map<string, { amount: number; students: number }>();
    for (const row of (giftResult.data as
      | {
          teacher_guardian_id: string | null;
          student_count: number | null;
          total_amount: number | null;
        }[]
      | null) ?? []) {
      if (!row.teacher_guardian_id) continue;
      const entry = giftTotals.get(row.teacher_guardian_id) ?? {
        amount: 0,
        students: 0,
      };
      entry.amount += row.total_amount ?? 0;
      entry.students += row.student_count ?? 0;
      giftTotals.set(row.teacher_guardian_id, entry);
    }

    return {
      teachers: (teacherResult.data as TeacherRow[] | null) ?? [],
      familyByGuardian,
      giftTotals,
      classesByGuardian,
      absencesByGuardian,
    };
  } catch {
    return {
      teachers: [],
      familyByGuardian: new Map(),
      giftTotals: new Map(),
      classesByGuardian: new Map(),
      absencesByGuardian: new Map(),
    };
  }
}

async function TeacherContent({
  basePath,
  sp,
  counts,
}: {
  basePath: string;
  sp: { [key: string]: string | string[] | undefined };
  counts: Awaited<ReturnType<typeof getApplicationCounts>>;
}) {
  const tab = sp.tab === "soknader" ? "soknader" : "laerere";
  const page = Math.max(1, Number(sp.page) || 1);
  const q = typeof sp.q === "string" ? sp.q : "";
  const rawStatus = typeof sp.status === "string" ? sp.status : "";
  const status = statusItems.some(
    (item) => item.value === rawStatus,
  )
    ? rawStatus
    : "aktive";
  const [registry, { rows: applications, total }] = await Promise.all([
    tab === "laerere"
      ? getRegisteredTeachers()
      : Promise.resolve({
          teachers: [] as TeacherRow[],
          familyByGuardian: new Map<string, string>(),
          giftTotals: new Map<string, { amount: number; students: number }>(),
          classesByGuardian: new Map<string, { id: string; name: string }[]>(),
          absencesByGuardian: new Map<string, TeacherAbsence[]>(),
        }),
    tab === "soknader"
      ? getApplications(page, q, status)
      : Promise.resolve({ rows: [] as TeacherApplicationRow[], total: 0 }),
  ]);
  const pageIds = applications.map((a) => a.id);
  const teacherPageCount = Math.max(
    1,
    Math.ceil(registry.teachers.length / PAGE_SIZE),
  );
  const teacherPage = Math.min(page, teacherPageCount);
  const visibleTeachers = registry.teachers.slice(
    (teacherPage - 1) * PAGE_SIZE,
    teacherPage * PAGE_SIZE,
  );
  const filtered = Boolean(q || status !== "aktive");

  return tab === "laerere" ? (
    <section
      aria-labelledby="teacher-registry"
      className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]"
    >
      <div className="border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
        <h2
          id="teacher-registry"
          className="font-heading text-xl font-bold"
        >
          Registrerte lærere
        </h2>
        <p className="mt-0.5 text-sm text-admin-muted">
          {registry.teachers.length}{" "}
          {registry.teachers.length === 1 ? "lærer" : "lærere"}. Lærere med
          barn på skolen kan få fritak for skolepenger.
        </p>
      </div>
      {registry.teachers.length > 0 ? (
        <OptimisticRemovalList
          className="divide-y divide-[#ECE8DF]"
          itemClassName="relative flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5"
          rows={visibleTeachers.map((teacher) => {
            const name =
              [teacher.first_name, teacher.last_name]
                .filter(Boolean)
                .join(" ") || "(uten navn)";
            const familyId = registry.familyByGuardian.get(teacher.id);
            const gift = registry.giftTotals.get(teacher.id);
            const assigned = registry.classesByGuardian.get(teacher.id) ?? [];
            const absences = registry.absencesByGuardian.get(teacher.id) ?? [];
            const unnotified = absences.filter((absence) => !absence.notified).length;
            return {
              id: teacher.id,
              content: (
                <>
                  <div className="min-w-0 flex-1 pr-10 sm:pr-0">
                    <p className="flex flex-wrap items-center gap-2 font-bold">
                      {name}
                      {teacher.teacher_suspended_at ? (
                        <StatusPill tone="danger">Suspendert</StatusPill>
                      ) : null}
                      {familyId ? (
                        <Link
                          href={`${basePath}/familier/${familyId}`}
                          className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <StatusPill tone="ok" className="hover:underline">
                            Har barn på skolen
                          </StatusPill>
                        </Link>
                      ) : (
                        <StatusPill tone="neutral">
                          Ikke koblet til familie
                        </StatusPill>
                      )}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-admin-muted">
                      {teacher.phone ? (
                        <a
                          href={`tel:${teacher.phone}`}
                          className="inline-flex min-h-11 items-center gap-1.5 font-bold text-[#277A31] underline-offset-2 hover:underline sm:min-h-0"
                        >
                          <Phone aria-hidden="true" className="size-3.5" />
                          {teacher.phone}
                        </a>
                      ) : null}
                      {teacher.email ? (
                        <a
                          href={`mailto:${teacher.email}`}
                          className="inline-flex min-h-11 items-center gap-1.5 break-all text-[#277A31] underline-offset-2 hover:underline sm:min-h-0"
                        >
                          <Mail aria-hidden="true" className="size-3.5" />
                          {teacher.email}
                        </a>
                      ) : null}
                      {teacher.teacher_note ? (
                        <span>{teacher.teacher_note}</span>
                      ) : null}
                    </p>
                    {teacher.teacher_suspended_at ? (
                      <p className="mt-1 text-sm text-[#8B2F2B]">
                        Suspendert {formatDate(teacher.teacher_suspended_at)}
                        {teacher.teacher_suspended_by
                          ? ` av ${teacher.teacher_suspended_by}`
                          : ""}
                        {teacher.teacher_suspended_reason
                          ? `: ${teacher.teacher_suspended_reason}`
                          : ""}
                      </p>
                    ) : null}
                    <p className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
                      <GraduationCap
                        aria-hidden="true"
                        className="size-4 text-admin-muted"
                      />
                      {assigned.length ? (
                        assigned.map((item) => (
                          <Link
                            key={item.id}
                            href={`${basePath}/klasser/${item.id}`}
                            className="inline-flex min-h-11 min-w-9 items-center justify-center rounded px-1 font-bold text-[#277A31] underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-0"
                          >
                            {item.name}
                          </Link>
                        ))
                      ) : (
                        <span className="text-admin-muted">
                          Ingen klasse i år
                        </span>
                      )}
                    </p>
                    {absences.length ? (
                      <details className="group mt-1">
                        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-8 [&::-webkit-details-marker]:hidden">
                          <CalendarX2 aria-hidden="true" className="size-4 text-admin-muted" />
                          Borte {absences.length} {absences.length === 1 ? "gang" : "ganger"}
                          {unnotified ? (
                            <span className="text-[#8B2F2B]">· {unnotified} ikke varslet</span>
                          ) : null}
                          <ChevronDown aria-hidden="true" className="size-4 text-admin-muted transition-transform group-open:rotate-180" />
                        </summary>
                        <ul className="mt-1 grid gap-1 text-sm">
                          {absences.map((absence) => (
                            <li key={absence.id} className="flex flex-wrap items-center gap-2">
                              <span className="tabular-nums">
                                {formatOsloDate(absence.date, { weekday: "short", day: "numeric", month: "short" })}
                              </span>
                              <NoticeBadge notified={absence.notified} />
                              {absence.reason ? <span className="text-admin-muted">{absence.reason}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    {gift ? (
                      <span className="text-sm text-admin-muted">
                        Fritatt{" "}
                        <span className="font-bold text-foreground tabular-nums">
                          {formatNok(gift.amount)}
                        </span>{" "}
                        ({gift.students} barn)
                      </span>
                    ) : null}
                    <div className="absolute top-3 right-2 sm:static">
                      <TeacherRowMenu
                        teacher={teacher}
                        name={name}
                        suspended={Boolean(teacher.teacher_suspended_at)}
                        canSendLink={Boolean(teacher.email) && !isPlaceholderEmail(teacher.email)}
                      />
                    </div>
                  </div>
                </>
              ),
            };
          })}
        />
      ) : (
        <EmptyState
          icon={<UserCheck aria-hidden="true" />}
          title="Ingen lærere er registrert ennå"
          description="Legg til en lærer med knappen over, eller registrer en lærer fra en søknad."
          headingLevel="h3"
        />
      )}
      {registry.teachers.length > 0 ? (
        <Pagination
          page={teacherPage}
          pageSize={PAGE_SIZE}
          total={registry.teachers.length}
          basePath={`${basePath}/laerere`}
          searchParams={sp}
        />
      ) : null}
    </section>
  ) : (
    <>
      <section className="rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3] sm:p-5">
        <form
          action={`${basePath}/laerere`}
          role="search"
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end"
        >
          <input type="hidden" name="tab" value="soknader" />
          <div className="grid gap-1.5">
            <label htmlFor="teacher-search" className="text-sm font-bold">
              Søk i søknader
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[#2F7938]"
              />
              <input
                id="teacher-search"
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Navn, e-post, telefon eller fag"
                className="min-h-11 w-full rounded-xl border border-[#CFC9BD] bg-white pr-4 pl-10 text-base sm:text-sm outline-none placeholder:text-admin-muted focus-visible:border-[#2F7938] focus-visible:ring-3 focus-visible:ring-[#2F7938]/20"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <span id="teacher-status-label" className="text-sm font-bold">
              Vis status
            </span>
            <Select
              key={status}
              name="status"
              defaultValue={status}
              items={statusItems}
            >
              <SelectTrigger
                aria-labelledby="teacher-status-label"
                className="w-full border-[#CFC9BD] bg-white"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-admin-action px-4 text-sm font-bold text-white outline-none hover:bg-[#245E2B] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Finn
            </button>
            {filtered ? (
              <Link
                href={`${basePath}/laerere?tab=soknader`}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#CFC9BD] px-3 text-sm font-bold outline-none hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Nullstill
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      <section
        aria-labelledby="teacher-inbox-title"
        className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]"
      >
        <div className="border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
          <h2
            id="teacher-inbox-title"
            className="font-heading text-xl font-bold"
          >
            Søknader
          </h2>
          <p className="mt-0.5 text-sm text-admin-muted" aria-live="polite">
            {filtered
              ? `${total} ${total === 1 ? "søknad passer" : "søknader passer"} valgte filtre`
              : `${counts.fresh} nye · ${counts.contacted} kontaktet · ${total} aktive`}
          </p>
        </div>
        {applications.length === 0 ? (
          <EmptyState
            icon={<CircleCheck aria-hidden="true" />}
            title={
              filtered
                ? "Ingen søknader passer filtrene"
                : "Ingen aktive søknader"
            }
            description={
              filtered
                ? "Prøv et annet søk eller velg en annen status."
                : "Søknader fra skjemaet Bli lærer på nettsiden vises her."
            }
            headingLevel="h3"
          />
        ) : (
          <BulkActions entity="teachers" ids={pageIds}>
            <div className="flex min-h-12 items-center gap-3 border-b border-[#ECE8DF] bg-[#FBFAF6] px-4 text-sm text-admin-muted sm:px-5">
              <BulkSelectAll />
              <span>Velg alle på denne siden</span>
            </div>
            <ul className="divide-y divide-[#ECE8DF]">
              {applications.map((application) => (
                <li key={application.id} className="p-4 sm:px-5">
                  <div className="flex items-start gap-3">
                    <div className="pt-1">
                      <BulkRowCheckbox id={application.id} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-heading text-lg font-bold">
                            {application.full_name ?? "Navn mangler"}
                          </p>
                          <p className="mt-0.5 text-sm text-admin-muted">
                            {application.subjects ?? "Fag ikke oppgitt"} ·
                            Mottatt {formatDate(application.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <TeacherStatusSelect
                            id={application.id}
                            status={application.status ?? "ny"}
                          />
                          <RowActions
                            label={`Flere valg for søknaden fra ${application.full_name ?? "ukjent"}`}
                            destructive={{
                              id: application.id,
                              label: "Slett søknad",
                              title: "Slette søknaden?",
                              description:
                                "Søknaden fjernes for godt. Vil du bare rydde i listen, sett status til Arkivert i stedet.",
                              successMessage: "Søknaden er slettet",
                              action: deleteTeacherApplication,
                            }}
                          />
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {application.email ? (
                          <a
                            href={`mailto:${application.email}`}
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F2F7F2] px-3 text-sm font-bold text-[#277A31] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            <Mail aria-hidden="true" className="size-4" />
                            {application.email}
                          </a>
                        ) : null}
                        {application.phone ? (
                          <a
                            href={`tel:${application.phone}`}
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F2F7F2] px-3 text-sm font-bold text-[#277A31] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            <Phone aria-hidden="true" className="size-4" />
                            {application.phone}
                          </a>
                        ) : null}
                        <TeacherRegisterDialog
                          compact
                          sourceApplicationId={application.id}
                          defaultName={application.full_name}
                          defaultEmail={application.email}
                          defaultPhone={application.phone}
                        />
                      </div>
                      {application.message ? (
                        <details className="group mt-3 rounded-xl bg-[#F8F6F0] px-3">
                          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                            <MessageSquareText
                              aria-hidden="true"
                              className="size-4 text-[#2F7938]"
                            />
                            Les melding
                            <ChevronDown
                              aria-hidden="true"
                              className="ml-auto size-4 transition-transform group-open:rotate-180"
                            />
                          </summary>
                          <p className="pb-3 text-sm whitespace-pre-line">
                            {application.message}
                          </p>
                        </details>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </BulkActions>
        )}
        {total > 0 ? (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath={`${basePath}/laerere`}
            searchParams={sp}
          />
        ) : null}
      </section>
    </>
  );
}

export default async function LaererePage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/laerere">) {
  const [{ locale }, sp, counts] = await Promise.all([
    params,
    searchParams,
    getApplicationCounts(),
  ]);
  const basePath = adminBasePath(locale);
  const tab = sp.tab === "soknader" ? "soknader" : "laerere";
  const tabs = [
    {
      key: "laerere",
      label: "Registrerte lærere",
      href: `${basePath}/laerere`,
    },
    {
      key: "soknader",
      label: "Søknader",
      href: `${basePath}/laerere?tab=soknader`,
      count: counts.fresh,
    },
  ];

  return (
    <div className="grid gap-5 sm:gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
            Lærere
          </h1>
          <p className="mt-1 max-w-2xl text-admin-muted">
            Lærerne på skolen og søknader fra dem som vil bidra.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TeacherRegisterDialog />
          {tab === "laerere" ? <ExportButton entity="teachers" /> : null}
        </div>
      </header>

      <nav
        aria-label="Visning"
        className="flex gap-1 border-b border-[#E3DED3]"
      >
        {tabs.map((item) => {
          const active = item.key === tab;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-bold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                active
                  ? "border-[#2F7938] text-[#1D4E24]"
                  : "border-transparent text-admin-muted hover:text-foreground",
              )}
            >
              {item.label}
              {item.count ? (
                <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[#FEEDCA] px-1.5 py-0.5 text-xs text-[#6B4A06] tabular-nums">
                  {item.count}
                  <span className="sr-only"> nye</span>
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <Suspense
        key={tab}
        fallback={
          tab === "laerere" ? (
            <ListCardSkeleton rows={4} />
          ) : (
            <>
              <FilterSkeleton />
              <ListCardSkeleton rows={4} tall />
            </>
          )
        }
      >
        <TeacherContent basePath={basePath} sp={sp} counts={counts} />
      </Suspense>
    </div>
  );
}
