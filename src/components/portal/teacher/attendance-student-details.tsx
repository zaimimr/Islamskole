"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Phone } from "lucide-react";
import type { PortalRosterRow } from "@/lib/portal/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function AttendanceStudentDetails({ row, reporting, pending, onReport, onCancel }: {
  row: PortalRosterRow;
  reporting: boolean;
  pending: boolean;
  onReport: (reason: string) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations("portal.teacher");
  const common = useTranslations("portal.common");
  const [reason, setReason] = useState(row.absence_reason ?? "");
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
  return (
    <div className="grid gap-3 border-t border-foreground/10 py-3 text-sm">
      {row.inherited_from_lesson_id ? <p className="text-admin-muted">{t("roster.inherited")}</p> : null}
      {row.attendance_marked_at ? <p className="text-xs text-admin-muted">{t("roster.savedAt", { time: new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" }).format(new Date(row.attendance_marked_at)) })}</p> : null}
      {row.absence_source ? <p className="font-semibold text-[#255C77]">{t(row.absence_source === "app" ? "absence.app" : "absence.teacher")}{row.absence_reason ? ` · ${row.absence_reason}` : ""}</p> : null}
      {reporting && row.absence_source !== "app" ? (
        <form onSubmit={(event) => { event.preventDefault(); void onReport(reason); }} className="grid gap-2">
          <Label htmlFor={`absence-note-${row.student_id}`}>{t("absence.reason", { name })}</Label>
          <Textarea id={`absence-note-${row.student_id}`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} disabled={pending} className="min-h-20 text-base" />
          <div className="flex gap-2"><Button type="submit" disabled={pending}>{pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}{t("roster.saveReport")}</Button><Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>{common("cancel")}</Button></div>
        </form>
      ) : null}
      {row.allergies ? <p className="font-semibold text-destructive">{t("roster.allergies")}: {row.allergies}</p> : null}
      {row.medical_notes ? <p className="font-semibold text-destructive">{t("roster.medical")}: {row.medical_notes}</p> : null}
      {row.photo_consent === false ? <p className="font-semibold">{t("roster.noPhoto")}</p> : null}
      <ul className="grid gap-1">
        {row.guardians.map((guardian, index) => {
          const guardianName = [guardian.first_name, guardian.last_name].filter(Boolean).join(" ");
          return <li key={index}>{guardian.phone ? <a href={`tel:${guardian.phone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg font-semibold text-admin-action outline-none focus-visible:ring-3 focus-visible:ring-ring/50"><Phone aria-hidden="true" className="size-4" /><span>{guardianName}</span><span className="font-normal tabular-nums">{guardian.phone}</span></a> : <p>{guardianName} · {t("roster.noPhone")}</p>}</li>;
        })}
        {!row.guardians.length ? <li className="text-admin-muted">{t("roster.noPhone")}</li> : null}
      </ul>
      {row.pickup.length ? <div className="grid gap-1"><h3 className="font-bold">{t("roster.pickup")}</h3>{row.pickup.map((person, index) => <p key={index}>{person.phone ? <a href={`tel:${person.phone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-admin-action outline-none focus-visible:ring-3 focus-visible:ring-ring/50"><Phone aria-hidden="true" className="size-4" />{person.name}{person.relation ? ` (${person.relation})` : ""} · {person.phone}</a> : person.name}</p>)}</div> : null}
    </div>
  );
}
