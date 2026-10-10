"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { recordAbsenceFollowUp } from "@/lib/attendance-followup/actions";

export function FollowUpForm({ studentId, studentName, classId, yearId, endedOn }: {
  studentId: string; studentName: string; classId: string; yearId: string; endedOn: string;
}) {
  const en = useLocale() === "en";
  const router = useRouter();
  const [action, setAction] = useState<"contacted" | "monitor" | "resolved" | "email">("contacted");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState(en ? `We have noticed that ${studentName} has missed several school Sundays. Please contact the school so we can follow up.` : `Vi har registrert at ${studentName} har vært borte flere skolesøndager. Ta gjerne kontakt med skolen, slik at vi kan følge opp.`);
  const [result, setResult] = useState("");
  const [pending, start] = useTransition();
  const [requestId, setRequestId] = useState<string | null>(null);
  return <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); start(async () => {
    setResult("");
    const id = requestId ?? crypto.randomUUID();
    setRequestId(id);
    const response = await recordAbsenceFollowUp({ id, studentId, classId, yearId, endedOn, action, note, message: action === "email" ? message : "" });
    if (!response.ok) { setResult(response.changed ? (en ? "Attendance changed. Reload this page." : "Oppmøtet er endret. Last siden på nytt.") : (en ? "Could not save follow-up" : "Kunne ikke lagre oppfølging")); return; }
    setRequestId(null); setNote(""); setResult(action === "email" ? (en ? "Email queued for guardians" : "E-post lagt i kø til foresatte") : (en ? "Follow-up saved" : "Oppfølging lagret")); router.refresh();
  }); }}>
    <SelectField aria-label={en ? "Follow-up action" : "Oppfølging"} value={action} onValueChange={(value) => { setAction(value as typeof action); setRequestId(null); }} disabled={pending} options={[
      { value: "contacted", label: en ? "Contact recorded" : "Kontakt registrert" }, { value: "monitor", label: en ? "Continue monitoring" : "Følg videre" },
      { value: "resolved", label: en ? "Resolved" : "Avklart" }, { value: "email", label: en ? "Send email to guardians" : "Send e-post til foresatte" },
    ]} />
    <div className="grid gap-2"><Label htmlFor={`followup-note-${studentId}`}>{en ? "Staff note" : "Internt notat"}</Label><Textarea id={`followup-note-${studentId}`} value={note} maxLength={2000} onChange={(event) => { setNote(event.target.value); setRequestId(null); }} disabled={pending} /></div>
    {action === "email" ? <div className="grid gap-2"><Label htmlFor={`followup-message-${studentId}`}>{en ? "Message to guardians" : "Melding til foresatte"}</Label><Textarea id={`followup-message-${studentId}`} value={message} maxLength={2000} required onChange={(event) => { setMessage(event.target.value); setRequestId(null); }} disabled={pending} /></div> : null}
    <Button className="w-fit" type="submit" disabled={pending || (action === "email" && !message.trim())}>{action === "email" ? (en ? "Send email" : "Send e-post") : (en ? "Save follow-up" : "Lagre oppfølging")}</Button>
    {result ? <p role="status">{result}</p> : null}
  </form>;
}
