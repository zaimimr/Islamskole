"use client";

import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { osloToday } from "@/lib/dates";
import { updateChild } from "@/lib/portal/family-actions";
import { GENDERS, LEVELS, type FamilyChild } from "@/lib/portal/family-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { Field, FormDialog, PHONE_PATTERN, RadioPills, formText } from "@/components/portal/family/family-ui";
import { PhoneField } from "@/components/ui/phone-field";

const LEVEL_FIELDS = [
  { name: "level_quran", key: "levelQuran" },
  { name: "level_arabic", key: "levelArabic" },
  { name: "level_islam", key: "levelIslam" },
] as const;

function formatBirthDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function ChildDetails({ child, name }: { child: FamilyChild; name: string }) {
  const t = useTranslations("portal.family.children");
  const tFamily = useTranslations("portal.family");
  const locale = useLocale();
  const firstName = child.first_name ?? name;
  const idPrefix = `child-details-${child.id}`;
  const gender = GENDERS.find((value) => value === child.gender);
  const levelLabel = (value: string | null) =>
    LEVELS.find((level) => level === value) ? t(`levels.${value as (typeof LEVELS)[number]}`) : null;
  const levels = LEVEL_FIELDS.map((field) => {
    const label = levelLabel(child[field.name]);
    return label ? `${t(field.key)}: ${label}` : null;
  }).filter(Boolean);

  const facts = [
    child.birth_date ? t("born", { date: formatBirthDate(child.birth_date, locale) }) : null,
    gender ? t(`genders.${gender}`) : null,
    child.email,
    child.phone,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="grid min-w-0 gap-0.5">
        <h4 id={`child-${child.id}-name`} className="font-heading text-lg font-semibold text-balance">
          {name}
        </h4>
        {facts.length ? <p className="text-sm break-words">{facts.join(" · ")}</p> : null}
        {levels.length ? <p className="text-sm text-muted-foreground">{levels.join(" · ")}</p> : null}
      </div>
      <FormDialog
        wide
        trigger={
          <Button type="button" variant="outline" aria-label={t("editTitle", { name: firstName })}>
            <Pencil aria-hidden="true" />
            {tFamily("edit")}
          </Button>
        }
        title={t("editTitle", { name: firstName })}
        description={t("editIntro")}
        submitLabel={tFamily("save")}
        onSubmit={async (form) => {
          const result = await updateChild(child.id, {
            firstName: formText(form, "first_name"),
            lastName: formText(form, "last_name"),
            birthDate: formText(form, "birth_date"),
            gender: formText(form, "gender"),
            email: formText(form, "email"),
            phone: formText(form, "phone"),
            levelQuran: formText(form, "level_quran"),
            levelArabic: formText(form, "level_arabic"),
            levelIslam: formText(form, "level_islam"),
          });
          if (result.ok) toast.success(t("saved", { name: formText(form, "first_name") || firstName }));
          return result;
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${idPrefix}-first`} label={t("firstName")}>
            <Input
              id={`${idPrefix}-first`}
              name="first_name"
              required
              maxLength={80}
              autoComplete="off"
              defaultValue={child.first_name ?? ""}
            />
          </Field>
          <Field id={`${idPrefix}-last`} label={t("lastName")}>
            <Input
              id={`${idPrefix}-last`}
              name="last_name"
              required
              maxLength={80}
              autoComplete="off"
              defaultValue={child.last_name ?? ""}
            />
          </Field>
        </div>
        <Field id={`${idPrefix}-birth`} label={t("birthDate")}>
          <Input
            id={`${idPrefix}-birth`}
            name="birth_date"
            type="date"
            required
            min="1950-01-01"
            max={osloToday()}
            defaultValue={child.birth_date ?? ""}
          />
        </Field>
        <RadioPills
          name="gender"
          legend={t("gender")}
          required
          defaultValue={child.gender}
          options={GENDERS.map((value) => ({ value, label: t(`genders.${value}`) }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${idPrefix}-email`} label={t("email")} hint={t("emailHint")} optional>
            <Input
              id={`${idPrefix}-email`}
              name="email"
              type="email"
              inputMode="email"
              maxLength={254}
              autoComplete="off"
              spellCheck={false}
              defaultValue={child.email ?? ""}
              aria-describedby={`${idPrefix}-email-hint`}
            />
          </Field>
          <Field id={`${idPrefix}-phone`} label={t("phone")} optional>
            <PhoneField
              id={`${idPrefix}-phone`}
              name="phone"
              maxLength={40}
              pattern={PHONE_PATTERN}
              defaultValue={child.phone}
            />
          </Field>
        </div>
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-medium">{t("levelsTitle")}</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            {LEVEL_FIELDS.map((field) => (
              <Field key={field.name} id={`${idPrefix}-${field.name}`} label={t(field.key)}>
                <SelectField
                  id={`${idPrefix}-${field.name}`}
                  name={field.name}
                  defaultValue={child[field.name] ?? ""}
                  options={[
                    { value: "", label: t("levelNone") },
                    ...LEVELS.map((value) => ({ value, label: t(`levels.${value}`) })),
                  ]}
                />
              </Field>
            ))}
          </div>
        </fieldset>
      </FormDialog>
    </div>
  );
}
