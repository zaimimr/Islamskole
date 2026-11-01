"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, UserRoundPlus } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { startSubstitute } from "@/lib/portal/teacher-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";

export function SubstitutePicker({ options }: { options: { value: string; label: string }[] }) {
  const t = useTranslations("portal.teacher.substitute");
  const tErrors = useTranslations("portal.errors");
  const router = useRouter();
  const [classId, setClassId] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!classId) return;
    startTransition(async () => {
      const result = await startSubstitute(classId);
      if (!result.ok) {
        toast.error(tErrors(result.error));
        return;
      }
      router.push(`/min-side/klasse/${classId}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/8 sm:p-5">
      <h3 className="font-heading text-lg font-semibold">{t("title")}</h3>
      <div className="grid gap-2">
        <Label htmlFor="substitute-class">{t("classLabel")}</Label>
        <SelectField
          id="substitute-class"
          options={options}
          value={classId}
          onValueChange={setClassId}
          placeholder={t("placeholder")}
        />
      </div>
      <Button type="submit" disabled={!classId || pending} className="w-fit">
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <UserRoundPlus aria-hidden="true" />
        )}
        {t("start")}
      </Button>
    </form>
  );
}
