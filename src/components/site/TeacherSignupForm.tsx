"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, PartyPopper } from "lucide-react";
import { createTeacherApplication } from "@/app/[locale]/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneField } from "@/components/ui/phone-field";

export function TeacherSignupForm() {
  const t = useTranslations("teacher");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const loadedAt = useRef<number | null>(null);

  useEffect(() => {
    loadedAt.current = Date.now();
  }, [formKey]);

  function handleReset() {
    loadedAt.current = Date.now();
    setFormKey((key) => key + 1);
    setDone(false);
  }

  function handleSubmit(formData: FormData) {
    formData.set("loaded_at", String(loadedAt.current ?? Date.now()));
    startTransition(async () => {
      const result = await createTeacherApplication(formData);
      if (result.ok) {
        toast.success(t("toastSuccess"));
        setDone(true);
      } else {
        toast.error(result.error);
      }
    });
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-primary/8 px-6 py-12 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-primary/15 text-brand-green-dark">
          <PartyPopper className="size-7" aria-hidden="true" />
        </span>
        <h3 className="font-heading text-2xl font-bold">{t("thanksTitle")}</h3>
        <p className="max-w-md text-base text-muted-foreground">
          {t("thanksBody")}
        </p>
        <Button variant="outline" onClick={handleReset}>
          {t("submitAnother")}
        </Button>
      </div>
    );
  }

  return (
    <form key={formKey} action={handleSubmit} className="grid gap-5">
      <div
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 overflow-hidden"
      >
        <label htmlFor="hp_field_t">La stå tom</label>
        <input
          id="hp_field_t"
          name="hp_field_t"
          type="text"
          tabIndex={-1}
          autoComplete="one-time-code"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="full_name" required>
          {t("fieldName")}
        </Label>
        <Input
          id="full_name"
          name="full_name"
          required
          autoComplete="name"
          placeholder={t("placeholderName")}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email" required>
          {t("fieldEmail")}
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={t("placeholderEmail")}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="phone">{t("fieldPhone")}</Label>
        <PhoneField id="phone" name="phone" autoComplete="tel-national" placeholder={t("placeholderPhone")} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="subjects">{t("fieldSubjects")}</Label>
        <Input
          id="subjects"
          name="subjects"
          placeholder={t("placeholderSubjects")}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="message">{t("fieldMessage")}</Label>
        <Textarea
          id="message"
          name="message"
          rows={5}
          placeholder={t("placeholderMessage")}
        />
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full sm:w-auto"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {t("submit")}
      </Button>
    </form>
  );
}
