"use client";

import { useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { BellOff, Clock, Mail, Pencil, Phone, Trash2, UserPlus, Users } from "lucide-react";
import {
  addGuardian,
  removeGuardian,
  requestEmailChange,
  updateFamilyGuardian,
} from "@/lib/portal/family-actions";
import { isPlaceholderEmail } from "@/lib/portal/emails";
import {
  RELATIONSHIP_LABELS,
  type FamilyGuardian,
  type PortalFamily,
} from "@/lib/portal/family-types";
import type { PortalErrorCode } from "@/lib/portal/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FormDialog,
  PHONE_PATTERN,
  RadioPills,
  formText,
  useErrorText,
} from "@/components/portal/family/family-ui";
import { PhoneField } from "@/components/ui/phone-field";

function guardianName(guardian: Pick<FamilyGuardian, "first_name" | "last_name">) {
  return [guardian.first_name, guardian.last_name].filter(Boolean).join(" ");
}

function isRelationship(value: string | null): value is (typeof RELATIONSHIP_LABELS)[number] {
  return RELATIONSHIP_LABELS.includes(value as (typeof RELATIONSHIP_LABELS)[number]);
}

function NameFields({ idPrefix, guardian }: { idPrefix: string; guardian?: FamilyGuardian }) {
  const t = useTranslations("portal.family.guardians");
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${idPrefix}-first`} label={t("firstName")}>
          <Input
            id={`${idPrefix}-first`}
            name="first_name"
            required
            maxLength={80}
            autoComplete="off"
            defaultValue={guardian?.first_name ?? ""}
          />
        </Field>
        <Field id={`${idPrefix}-last`} label={t("lastName")}>
          <Input
            id={`${idPrefix}-last`}
            name="last_name"
            required
            maxLength={80}
            autoComplete="off"
            defaultValue={guardian?.last_name ?? ""}
          />
        </Field>
      </div>
      <Field id={`${idPrefix}-phone`} label={t("phone")} optional>
        <PhoneField
          id={`${idPrefix}-phone`}
          name="phone"
          maxLength={40}
          pattern={PHONE_PATTERN}
          defaultValue={guardian?.phone}
        />
      </Field>
    </>
  );
}

function RelationshipField({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations("portal.family.guardians");
  return (
    <RadioPills
      name="relationship"
      legend={t("relationship")}
      required
      defaultValue={defaultValue}
      options={RELATIONSHIP_LABELS.map((label) => ({ value: label, label: t(`relations.${label}`) }))}
    />
  );
}

function GuardianItem({ guardian, family }: { guardian: FamilyGuardian; family: PortalFamily }) {
  const t = useTranslations("portal.family");
  const locale = useLocale();
  const errorText = useErrorText();
  const name = guardianName(guardian);
  const idPrefix = `guardian-${guardian.id}`;
  const relation = isRelationship(guardian.relationship_label)
    ? t(`guardians.relations.${guardian.relationship_label}`)
    : null;

  const sameEmail = useRef(false);

  function emailErrorText(code: PortalErrorCode) {
    if (sameEmail.current) return t("emailChange.same");
    return code === "duplicate" ? t("emailChange.duplicate") : errorText(code);
  }

  return (
    <li data-testid="family-guardian" className="grid gap-3 rounded-2xl p-4 ring-1 ring-foreground/10">
      <div className="grid gap-0.5">
        <p className="flex flex-wrap items-baseline gap-x-2 font-semibold">
          {name}
          {guardian.is_me ? (
            <span className="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-bold text-brand-green-dark">
              {t("guardians.you")}
            </span>
          ) : null}
        </p>
        {relation ? <p className="text-sm text-muted-foreground">{relation}</p> : null}
        {!guardian.receives_communication ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <BellOff aria-hidden="true" className="size-4" />
            {t("guardians.noMessages")}
          </p>
        ) : null}
      </div>
      <dl className="grid gap-2 text-sm">
        <div className="flex items-center gap-2">
          <dt>
            <Phone aria-hidden="true" className="size-4 text-muted-foreground" />
            <span className="sr-only">{t("guardians.phone")}</span>
          </dt>
          <dd className={guardian.phone ? undefined : "text-muted-foreground"}>
            {guardian.phone ?? t("guardians.noPhone")}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt>
            <Mail aria-hidden="true" className="size-4 text-muted-foreground" />
            <span className="sr-only">{t("guardians.email")}</span>
          </dt>
          <dd className={guardian.email ? "min-w-0 break-all" : "text-muted-foreground"}>
            {guardian.email ?? t("guardians.noEmail")}
          </dd>
        </div>
      </dl>
      {guardian.pending_email ? (
        <p className="flex gap-2 rounded-xl bg-secondary/70 p-3 text-sm text-secondary-foreground">
          <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">{t("guardians.pending", { email: guardian.pending_email })}</span>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <FormDialog
          trigger={
            <Button type="button" variant="outline" aria-label={t("guardians.editTitle", { name })}>
              <Pencil aria-hidden="true" />
              {t("edit")}
            </Button>
          }
          title={t("guardians.editTitle", { name })}
          submitLabel={t("save")}
          errorText={(code) => (code === "invalid" ? t("guardians.editInvalid") : errorText(code))}
          onSubmit={async (form) => {
            const result = await updateFamilyGuardian(family.id, guardian.id, {
              firstName: formText(form, "first_name"),
              lastName: formText(form, "last_name"),
              phone: formText(form, "phone"),
              relationship: formText(form, "relationship"),
              receivesCommunication: form.get("receives_communication") === "on",
            });
            if (result.ok) toast.success(t("guardians.saved"));
            return result;
          }}
        >
          <NameFields idPrefix={`${idPrefix}-edit`} guardian={guardian} />
          <RelationshipField
            defaultValue={isRelationship(guardian.relationship_label) ? guardian.relationship_label : "foresatt"}
          />
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ring-1 ring-foreground/10 has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
            <input
              type="checkbox"
              name="receives_communication"
              defaultChecked={guardian.receives_communication}
              className="mt-0.5 size-4 shrink-0 accent-[var(--brand-green-dark)]"
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{t("guardians.receivesMessages")}</span>
              <span className="text-sm text-muted-foreground">{t("guardians.receivesMessagesHint")}</span>
            </span>
          </label>
        </FormDialog>
        {guardian.is_me || !guardian.email || isPlaceholderEmail(guardian.email) ? (
          <FormDialog
            trigger={
              <Button type="button" variant="outline" aria-label={t("emailChange.openLabel", { name })}>
                <Mail aria-hidden="true" />
                {t("emailChange.open")}
              </Button>
            }
            title={t("emailChange.title", { name })}
            description={t("emailChange.intro")}
            submitLabel={t("emailChange.submit")}
            errorText={emailErrorText}
            onSubmit={async (form) => {
              const email = formText(form, "email").toLowerCase();
              sameEmail.current = Boolean(email) && email === guardian.email?.trim().toLowerCase();
              if (sameEmail.current) return { ok: false, error: "invalid" as const };
              const result = await requestEmailChange(guardian.id, email, locale);
              if (result.ok) toast.success(t("emailChange.sent", { email }));
              return result;
            }}
          >
            <Field id={`${idPrefix}-email`} label={t("emailChange.label")}>
              <Input
                id={`${idPrefix}-email`}
                name="email"
                type="email"
                inputMode="email"
                required
                maxLength={254}
                autoComplete="email"
                spellCheck={false}
              />
            </Field>
          </FormDialog>
        ) : null}
        {!guardian.is_me && family.guardians.length > 1 ? (
          <FormDialog
            trigger={
              <Button type="button" variant="ghost" aria-label={t("guardians.removeLabel", { name })}>
                <Trash2 aria-hidden="true" />
                {t("guardians.remove")}
              </Button>
            }
            title={t("guardians.removeTitle", { name })}
            description={t("guardians.removeIntro", { name })}
            submitLabel={t("guardians.removeConfirm")}
            destructive
            onSubmit={async () => {
              const result = await removeGuardian(family.id, guardian.id);
              if (result.ok) toast.success(t("guardians.removed", { name }));
              return result;
            }}
          />
        ) : null}
      </div>
    </li>
  );
}

export function GuardianSection({ family }: { family: PortalFamily }) {
  const t = useTranslations("portal.family");
  const idPrefix = `guardians-${family.id}`;

  return (
    <section aria-labelledby={`${idPrefix}-title`} className="grid gap-3 px-5 py-5 sm:px-6">
      <h3 id={`${idPrefix}-title`} className="flex items-center gap-2 font-heading text-lg font-semibold">
        <Users aria-hidden="true" className="size-5 text-brand-green-dark" />
        {t("guardians.title")}
      </h3>
      <ul className="grid gap-3">
        {family.guardians.map((guardian) => (
          <GuardianItem key={guardian.id} guardian={guardian} family={family} />
        ))}
      </ul>
      <FormDialog
        trigger={
          <Button type="button" variant="outline" className="w-full sm:w-fit">
            <UserPlus aria-hidden="true" />
            {t("guardians.add")}
          </Button>
        }
        title={t("guardians.addTitle")}
        description={t("guardians.addIntro")}
        submitLabel={t("guardians.add")}
        onSubmit={async (form) => {
          const firstName = formText(form, "first_name");
          const result = await addGuardian(family.id, {
            firstName,
            lastName: formText(form, "last_name"),
            phone: formText(form, "phone"),
            relationship: formText(form, "relationship"),
          });
          if (result.ok) toast.success(t("guardians.added", { name: firstName }));
          return result;
        }}
      >
        <NameFields idPrefix={`${idPrefix}-add`} />
        <RelationshipField defaultValue="foresatt" />
      </FormDialog>
    </section>
  );
}
