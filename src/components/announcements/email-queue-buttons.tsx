"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { processSchoolEmailQueue, retrySchoolEmail } from "@/lib/school-emails/admin-actions";

export function EmailQueueButton({ locale, id }: { locale: string; id?: string }) {
  const [pending, startTransition] = useTransition();
  const en = locale === "en";
  return <Button variant="outline" disabled={pending} onClick={() => startTransition(async () => {
    const result = id ? await retrySchoolEmail(id) : await processSchoolEmailQueue();
    if (result.ok) toast.success(en ? "Email delivery queued" : "E-post er lagt i kø");
    else toast.error(en ? "Could not queue email. Try again." : "Kunne ikke legge e-post i kø. Prøv igjen.");
  })}>{id ? (en ? "Retry" : "Prøv igjen") : (en ? "Process queue" : "Behandle kø")}</Button>;
}
