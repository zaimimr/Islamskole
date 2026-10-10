"use client";

import { useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { stopImpersonation } from "@/lib/impersonation/actions";

export function ReturnToAccount({ expiresAt }: { expiresAt: string | null }) {
  const t = useTranslations("impersonation");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!expiresAt) return;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) return;
    const timeout = window.setTimeout(() => window.location.reload(), remaining + 1000);
    return () => window.clearTimeout(timeout);
  }, [expiresAt]);

  function handleReturn() {
    startTransition(async () => {
      try {
        const result = await stopImpersonation();
        if (result.ok) window.location.assign(result.href);
        else toast.error(t("error"));
      } catch {
        toast.error(t("error"));
      }
    });
  }

  return (
    <Button type="button" variant="outline" disabled={pending} onClick={handleReturn}
      className="min-h-11 shrink-0 border-amber-800/30 bg-white text-amber-950 hover:bg-amber-50">
      <Undo2 aria-hidden="true" className="size-4" />
      {pending ? t("returning") : t("return")}
    </Button>
  );
}
