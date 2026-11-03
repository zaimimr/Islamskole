"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, CheckCheck, ChevronDown, Clock, Loader2, MessageSquareText, MoreHorizontal, Phone, UserRound, X } from "lucide-react";
import { markAttendance, markUnrecordedPresent, reportAbsenceForStudent, withdrawAbsenceForStudent } from "@/lib/portal/actions";
import type { AbsenceSource, AttendanceStatus, PortalActionResult, PortalRosterRow } from "@/lib/portal/types";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AttendanceStudentDetails } from "./attendance-student-details";
import { cn } from "@/lib/utils";

type Entry = { status: AttendanceStatus | null; source: AbsenceSource | null };
type EntryMap = Record<string, Entry>;
type StatusFilter = AttendanceStatus | "unmarked" | null;

function subscribeToHydration() {
  return () => {};
}

const STATUS_OPTIONS = [
  { status: "til_stede", icon: Check, color: "text-admin-action" },
  { status: "sent", icon: Clock, color: "text-[#805400]" },
  { status: "meldt_fravaer", icon: MessageSquareText, color: "text-[#255C77]" },
  { status: "fravaer", icon: X, color: "text-destructive" },
] as const;

export function AttendanceRoster({
  rows, lessonId, markable, reportable, header, expanded = true, onExpand, studentBasePath,
}: {
  rows: PortalRosterRow[];
  lessonId: string;
  markable: boolean;
  reportable: boolean;
  header?: ReactNode;
  expanded?: boolean;
  onExpand?: () => void;
  studentBasePath?: string;
}) {
  const t = useTranslations("portal.teacher");
  const tErrors = useTranslations("portal.errors");
  const router = useRouter();
  const pathname = usePathname();
  const ready = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [overrides, setOverrides] = useState<EntryMap>({});
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [bulkPending, setBulkPending] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>(null);
  const [seenRows, setSeenRows] = useState(rows);
  const sequence = useRef<Record<string, number>>({});
  if (seenRows !== rows) {
    setSeenRows(rows);
    setOverrides(Object.fromEntries(Object.entries(overrides).filter(([id]) => pendingIds.includes(id))));
  }
  const entries: EntryMap = {
    ...Object.fromEntries(rows.map((row) => [row.student_id, { status: row.attendance_status, source: row.absence_source }])),
    ...overrides,
  };
  const counts = { til_stede: 0, sent: 0, meldt_fravaer: 0, fravaer: 0, unmarked: 0 };
  for (const row of rows) counts[entries[row.student_id]?.status ?? "unmarked"] += 1;
  const unmarkedIds = rows.filter((row) => !entries[row.student_id]?.status && !entries[row.student_id]?.source).map((row) => row.student_id);
  const visibleRows = filter ? rows.filter((row) => (entries[row.student_id]?.status ?? "unmarked") === filter) : rows;
  const studentPath = studentBasePath ?? `${pathname}/elev/`;

  async function run(studentId: string, entry: Entry, action: () => Promise<PortalActionResult>) {
    const previous = entries[studentId];
    const ticket = sequence.current[studentId] = (sequence.current[studentId] ?? 0) + 1;
    setOverrides((current) => ({ ...current, [studentId]: entry }));
    setPendingIds((current) => [...current, studentId]);
    let result: PortalActionResult;
    try { result = await action(); } catch { result = { ok: false, error: "unknown" }; }
    if (!result.ok) {
      toast.error(tErrors(result.error));
      if (sequence.current[studentId] === ticket) setOverrides((current) => ({ ...current, [studentId]: previous }));
    }
    setPendingIds((current) => current.filter((id) => id !== studentId));
    return result;
  }

  function chooseStatus(row: PortalRosterRow, status: AttendanceStatus) {
    if (status === "meldt_fravaer") {
      if (entries[row.student_id]?.source === "app") {
        void run(row.student_id, { status, source: "app" }, () => reportAbsenceForStudent(row.student_id, lessonId));
        return;
      }
      setDetailsId(row.student_id);
      setReportId(row.student_id);
      return;
    }
    const source = entries[row.student_id]?.source;
    void run(row.student_id, { status, source: source === "app" ? source : null }, () => markAttendance(row.student_id, lessonId, status));
  }

  async function markRest() {
    if (!unmarkedIds.length || bulkPending) return;
    setBulkPending(true);
    try {
      const result = await markUnrecordedPresent(unmarkedIds, lessonId);
      if (!result.ok) toast.error(tErrors(result.error));
      else {
        setOverrides((current) => ({ ...current, ...Object.fromEntries(result.studentIds.map((id) => [id, { status: "til_stede", source: null }])) }));
        toast.success(t("roster.markedPresent", { count: result.studentIds.length }));
        router.refresh();
      }
    } catch { toast.error(tErrors("unknown")); }
    setBulkPending(false);
  }

  async function report(row: PortalRosterRow, reason: string) {
    const result = await run(row.student_id, { status: "meldt_fravaer", source: entries[row.student_id]?.source ?? "laerer" }, () => reportAbsenceForStudent(row.student_id, lessonId, reason));
    if (result.ok) { setReportId(null); toast.success(t("roster.saved")); }
  }

  function toggleFilter(value: StatusFilter) {
    setFilter((current) => current === value ? null : value);
    onExpand?.();
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-2">
      {header}
      {expanded ? <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3">
        {STATUS_OPTIONS.map(({ status, color }) => (
          <button key={status} type="button" onClick={() => toggleFilter(status)} aria-pressed={filter === status} className={cn("min-h-11 rounded-lg px-1 text-xs font-semibold tabular-nums outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm", color, filter === status && "bg-muted ring-1 ring-current")}>
            {counts[status]} {t(`summary.${status === "til_stede" ? "present" : status === "sent" ? "late" : status === "meldt_fravaer" ? "reported" : "unreported"}`)}
          </button>
        ))}
        <button type="button" onClick={() => toggleFilter("unmarked")} aria-pressed={filter === "unmarked"} className={cn("min-h-11 rounded-lg px-1 text-xs font-semibold text-admin-muted tabular-nums outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm", filter === "unmarked" && "bg-muted ring-1 ring-current")}>
          {counts.unmarked} {t("summary.unmarked")}
        </button>
      </div> : <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 text-xs font-semibold tabular-nums">
        {STATUS_OPTIONS.filter(({ status }) => counts[status] > 0).map(({ status, color }) => (
          <span key={status} className={color}>{counts[status]} {t(`summary.${status === "til_stede" ? "present" : status === "sent" ? "late" : status === "meldt_fravaer" ? "reported" : "unreported"}`)}</span>
        ))}
        {counts.unmarked > 0 || !rows.length ? <span className="text-admin-muted">{counts.unmarked} {t("summary.unmarked")}</span> : null}
      </div>}
      {expanded && markable && unmarkedIds.length ? (
        <Button type="button" variant="secondary" onClick={markRest} disabled={!ready || bulkPending || pendingIds.length > 0} className="mx-3 mb-1 min-h-11 justify-self-start text-sm">
          {bulkPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <CheckCheck aria-hidden="true" />}
          {t("roster.markUnrecorded", { count: unmarkedIds.length })}
        </Button>
      ) : null}
      {expanded ? (
        <ul className="divide-y divide-foreground/10 border-t border-foreground/10">
          {visibleRows.map((row) => {
            const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
            const entry = entries[row.student_id];
            const option = STATUS_OPTIONS.find((item) => item.status === entry.status);
            const StatusIcon = option?.icon ?? Check;
            const pending = !ready || pendingIds.includes(row.student_id) || bulkPending;
            const detailsOpen = detailsId === row.student_id;
            return (
              <li key={row.student_id} className="px-3 py-1">
                <div className="flex min-h-14 items-center gap-1.5">
                  <div className="min-w-0 flex-1 py-1">
                    <p className="wrap-anywhere text-sm leading-snug font-bold sm:text-base">{name}</p>
                    {row.age !== null ? <p className="text-xs text-admin-muted">{t("roster.age", { age: row.age })}</p> : null}
                    {row.allergies || row.medical_notes || row.photo_consent === false ? (
                      <button type="button" onClick={() => setDetailsId(detailsOpen ? null : row.student_id)} className="min-h-11 text-xs font-bold text-destructive underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                        {row.allergies ? `${t("roster.allergies")}: ${row.allergies}` : row.medical_notes ? t("roster.medical") : t("roster.noPhoto")}
                      </button>
                    ) : null}
                  </div>
                  {markable && !entry.status ? (
                    <Button type="button" size="sm" variant="outline" aria-label={t("roster.markPresentFor", { name })} disabled={pending} onClick={() => chooseStatus(row, "til_stede")} className="min-h-11 shrink-0 px-2 text-admin-action">
                      <Check aria-hidden="true" className="size-4" />{t("status.til_stede")}
                    </Button>
                  ) : null}
                  {markable ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button type="button" variant="ghost" disabled={pending} aria-label={t("roster.statusGroup", { name })} className={cn("min-h-11 min-w-11 shrink-0 gap-1 px-2 text-xs sm:text-sm", option?.color)} />}>
                        {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : entry.status ? <><StatusIcon aria-hidden="true" className="size-4" /><span className="max-w-24 text-wrap">{t(`status.${entry.status}`)}</span></> : null}
                        <ChevronDown aria-hidden="true" className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-52">
                        {STATUS_OPTIONS.map(({ status, icon: Icon }) => <DropdownMenuItem key={status} onClick={() => chooseStatus(row, status)}><Icon aria-hidden="true" />{t(`status.${status}`)}{entry.status === status ? <Check aria-hidden="true" className="ml-auto" /> : null}</DropdownMenuItem>)}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : reportable ? (
                    <Button type="button" variant="ghost" disabled={pending || entry.source === "app"} onClick={() => { setDetailsId(row.student_id); setReportId(row.student_id); }} className="min-h-11 max-w-28 text-wrap text-xs text-[#255C77]">{t("status.meldt_fravaer")}</Button>
                  ) : entry.status ? <span className={cn("max-w-28 text-right text-xs font-semibold", option?.color)}>{t(`status.${entry.status}`)}</span> : null}
                  {row.absence_reason ? <Button type="button" size="icon" variant="ghost" onClick={() => setDetailsId(detailsOpen ? null : row.student_id)} aria-label={t("absence.reason", { name })} className="size-11 shrink-0"><MessageSquareText aria-hidden="true" className="size-4" /></Button> : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={t("roster.actionsFor", { name })} className="size-11 shrink-0" />}><MoreHorizontal aria-hidden="true" className="size-5" /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-56">
                      <DropdownMenuItem render={<Link href={`${studentPath}${row.student_id}`} />}><UserRound aria-hidden="true" />{t("roster.studentInfo")}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDetailsId(detailsOpen ? null : row.student_id)}><Phone aria-hidden="true" />{t("roster.contacts")}</DropdownMenuItem>
                      {row.guardians.filter((guardian) => guardian.phone).map((guardian, index) => <DropdownMenuItem key={index} render={<a href={`tel:${guardian.phone!.replace(/[^\d+]/g, "")}`} />}><Phone aria-hidden="true" />{t("roster.call", { name: [guardian.first_name, guardian.last_name].filter(Boolean).join(" ") })}</DropdownMenuItem>)}
                      {entry.source === "laerer" && reportable ? <><DropdownMenuSeparator /><DropdownMenuItem disabled={pending} onClick={() => void run(row.student_id, { status: null, source: null }, () => withdrawAbsenceForStudent(row.student_id, lessonId))}>{t("roster.withdrawReport")}</DropdownMenuItem></> : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {detailsOpen ? <AttendanceStudentDetails row={row} reporting={reportId === row.student_id} pending={pending} onReport={(reason) => report(row, reason)} onCancel={() => setReportId(null)} /> : null}
              </li>
            );
          })}
          {!visibleRows.length ? <li className="px-3 py-4 text-sm text-admin-muted">{t("roster.emptyFilter")}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
