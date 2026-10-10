"use client";

import { useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveLessonHandover } from "@/lib/portal/material-actions";

export function HandoverEditor({ lessonId, instructions }: { lessonId: string; instructions: string }) {
  const en = useLocale() === "en";
  const [value, setValue] = useState(instructions);
  const [pending, startTransition] = useTransition();
  return <form className="grid gap-3" onSubmit={(event) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveLessonHandover(lessonId, value);
      if (result.ok) toast.success(en ? "Handover saved" : "Vikarbeskjed lagret");
      else toast.error(en ? "Could not save handover" : "Kunne ikke lagre vikarbeskjed");
    });
  }}>
    <Label htmlFor={`handover-${lessonId}`}>{en ? "Instructions for staff" : "Beskjed til lærere og vikarer"}</Label>
    <Textarea id={`handover-${lessonId}`} value={value} onChange={(event) => setValue(event.target.value)} maxLength={6000} rows={4} disabled={pending} className="bg-card text-base" />
    <Button type="submit" className="min-h-11 w-fit" disabled={pending}>{en ? "Save handover" : "Lagre vikarbeskjed"}</Button>
  </form>;
}
