"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Loader2 } from "lucide-react";
import { saveRequestSettings } from "@/app/[locale]/admin/payment-request-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function RequestSettings({
  enabled,
  leadDays,
  reminderDays,
  maxReminders,
}: {
  enabled: boolean;
  leadDays: number;
  reminderDays: number;
  maxReminders: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState({ leadDays, reminderDays, maxReminders });

  function save(next: { enabled: boolean } & typeof values, success: string) {
    startTransition(async () => {
      const result = await saveRequestSettings(next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  const field = (
    key: keyof typeof values,
    label: string,
    min: number,
    max: number,
  ) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`request-${key}`}>{label}</Label>
      <Input
        id={`request-${key}`}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={values[key]}
        onChange={(event) =>
          setValues((current) => ({ ...current, [key]: Number(event.target.value) }))
        }
        className="min-h-11"
      />
    </div>
  );

  return (
    <section className="grid min-w-0 gap-3 rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3] sm:p-5">
      <label className="flex min-h-11 items-center justify-between gap-3">
        <span className="font-heading text-lg font-bold">Automatiske krav</span>
        <Switch
          checked={enabled}
          disabled={pending}
          onCheckedChange={(checked) =>
            save(
              { enabled: checked, ...values },
              checked ? "Automatiske krav er på" : "Automatiske krav er av",
            )
          }
        />
      </label>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-bold text-admin-muted">
          Innstillinger
          <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save({ enabled, ...values }, "Innstillinger lagret");
          }}
          className="grid gap-3 pt-2"
        >
          {field("leadDays", "Send krav dager før frist", 0, 60)}
          {field("reminderDays", "Påminnelse etter dager", 1, 60)}
          {field("maxReminders", "Maks påminnelser", 0, 10)}
          <Button type="submit" disabled={pending} className="min-h-11 rounded-xl font-bold">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Lagre
          </Button>
        </form>
      </details>
    </section>
  );
}
