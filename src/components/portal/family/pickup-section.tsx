"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { HandHeart, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { addPickupPerson, removePickupPerson, updatePickupPerson } from "@/lib/portal/family-actions";
import type { FamilyPickup, PortalFamily } from "@/lib/portal/family-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormDialog, PHONE_PATTERN, formText, useErrorText } from "@/components/portal/family/family-ui";
import { PhoneField } from "@/components/ui/phone-field";

function PickupFields({ idPrefix, person }: { idPrefix: string; person?: FamilyPickup }) {
  const t = useTranslations("portal.family.pickup");
  return (
    <>
      <Field id={`${idPrefix}-name`} label={t("name")}>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          required
          maxLength={120}
          autoComplete="off"
          defaultValue={person?.name ?? ""}
        />
      </Field>
      <Field id={`${idPrefix}-phone`} label={t("phone")} optional>
        <PhoneField
          id={`${idPrefix}-phone`}
          name="phone"
          maxLength={40}
          pattern={PHONE_PATTERN}
          defaultValue={person?.phone}
        />
      </Field>
      <Field id={`${idPrefix}-relation`} label={t("relation")} optional>
        <Input
          id={`${idPrefix}-relation`}
          name="relation"
          maxLength={60}
          autoComplete="off"
          placeholder={t("relationPlaceholder")}
          defaultValue={person?.relation ?? ""}
        />
      </Field>
    </>
  );
}

function pickupInput(form: FormData) {
  return {
    name: formText(form, "name"),
    phone: formText(form, "phone"),
    relation: formText(form, "relation"),
  };
}

export function PickupSection({ family }: { family: PortalFamily }) {
  const t = useTranslations("portal.family.pickup");
  const errorText = useErrorText();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idPrefix = `pickup-${family.id}`;

  function handleRemove(id: string, name: string) {
    setRemovingId(id);
    startTransition(async () => {
      const result = await removePickupPerson(id);
      setRemovingId(null);
      if (result.ok) toast.success(t("removed", { name }));
      else toast.error(errorText(result.error));
    });
  }

  return (
    <section aria-labelledby={`${idPrefix}-title`} className="grid gap-3 px-5 py-5 sm:px-6">
      <h3 id={`${idPrefix}-title`} className="flex items-center gap-2 font-heading text-lg font-semibold">
        <HandHeart aria-hidden="true" className="size-5 text-brand-green-dark" />
        {t("title")}
      </h3>
      <p className="text-sm text-pretty text-muted-foreground">{t("intro")}</p>
      {family.pickup.length ? (
        <ul className="grid gap-2">
          {family.pickup.map((person) => (
            <li
              key={person.id}
              data-testid="family-pickup"
              className="flex items-center gap-3 rounded-2xl py-2 pr-2 pl-4 ring-1 ring-foreground/10"
            >
              <p className="mr-auto min-w-0 text-sm">
                <span className="block font-semibold">{person.name}</span>
                <span className="block text-muted-foreground">
                  {[person.relation, person.phone].filter(Boolean).join(" · ")}
                </span>
              </p>
              <FormDialog
                trigger={
                  <Button type="button" variant="ghost" aria-label={t("editLabel", { name: person.name })}>
                    <Pencil aria-hidden="true" />
                    <span className="sr-only sm:not-sr-only">{t("edit")}</span>
                  </Button>
                }
                title={t("editTitle", { name: person.name })}
                submitLabel={t("save")}
                onSubmit={async (form) => {
                  const input = pickupInput(form);
                  const result = await updatePickupPerson(person.id, input);
                  if (result.ok) toast.success(t("saved", { name: input.name }));
                  return result;
                }}
              >
                <PickupFields idPrefix={`pickup-${person.id}`} person={person} />
              </FormDialog>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleRemove(person.id, person.name)}
                disabled={pending}
                aria-label={t("removeLabel", { name: person.name })}
              >
                {removingId === person.id ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <Trash2 aria-hidden="true" />
                )}
                <span className="sr-only sm:not-sr-only">{t("remove")}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">{t("empty")}</p>
      )}
      {family.pickup.length < 10 ? (
        <FormDialog
          trigger={
            <Button type="button" variant="outline" className="w-full sm:w-fit">
              <Plus aria-hidden="true" />
              {t("add")}
            </Button>
          }
          title={t("addTitle")}
          submitLabel={t("add")}
          onSubmit={async (form) => {
            const input = pickupInput(form);
            const result = await addPickupPerson(family.id, input);
            if (result.ok) toast.success(t("added", { name: input.name }));
            return result;
          }}
        >
          <PickupFields idPrefix={idPrefix} />
        </FormDialog>
      ) : null}
    </section>
  );
}
