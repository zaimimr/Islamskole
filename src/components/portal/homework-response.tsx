"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { Check, HandHelping, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { respondToHomework } from "@/lib/portal/homework-actions";

export function HomeworkResponse({ noteId, studentId, status, homeworkVersion }: { noteId: string; studentId: string; status: string; homeworkVersion: number }) {
  const en = useLocale() === "en";
  const [pending, startTransition] = useTransition();
  function respond(next: string) {
    startTransition(async () => {
      const result = await respondToHomework({ noteId, studentId, homeworkVersion, status: next });
      if (!result.ok) toast.error(("changed" in result && result.changed) ? (en ? "Homework changed. Reload and try again." : "Leksen er endret. Last inn siden på nytt og prøv igjen.") : (en ? "Could not save. Try again." : "Kunne ikke lagre. Prøv igjen."));
    });
  }
  return <div className="flex flex-wrap gap-2">
    <Button variant={status === "completed" ? "default" : "outline"} className="min-h-11" disabled={pending} aria-pressed={status === "completed"} onClick={() => respond("completed")}>
      <Check aria-hidden="true" className="size-4" />{en ? "Completed" : "Fullført"}
    </Button>
    <Button variant={status === "needs_help" ? "default" : "outline"} className="min-h-11" disabled={pending} aria-pressed={status === "needs_help"} onClick={() => respond("needs_help")}>
      <HandHelping aria-hidden="true" className="size-4" />{en ? "Need help" : "Trenger hjelp"}
    </Button>
    {status !== "not_started" ? <Button variant="ghost" className="min-h-11" disabled={pending} onClick={() => respond("not_started")}>
      <RotateCcw aria-hidden="true" className="size-4" />{en ? "Reset" : "Nullstill"}
    </Button> : null}
  </div>;
}
