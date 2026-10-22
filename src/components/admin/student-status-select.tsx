"use client";

import { Archive, Ban, PhoneCall, ShieldAlert, Trash2, Undo2 } from "lucide-react";
import {
  deleteStudentApplication,
  updateStudentApplicationStatus,
} from "@/app/[locale]/admin/actions";
import { markApplicationsAsSpam } from "@/app/[locale]/admin/(admin-only)/register/register-actions";
import {
  RowActionsMenu,
  type RowAction,
} from "@/components/admin/row-actions-menu";

export function StudentStatusMenu({
  id,
  name,
  status,
  paid,
}: {
  id: string;
  name: string;
  status: string;
  paid: boolean;
}) {
  const actions: RowAction[] = [];

  if (status !== "ny") {
    actions.push({
      id: "reopen",
      label: "Sett tilbake til ny",
      icon: Undo2,
      run: () => updateStudentApplicationStatus(id, "ny"),
      success: "Innmeldingen er satt tilbake til ny",
    });
  }
  if (status !== "kontaktet") {
    actions.push({
      id: "contacted",
      label: "Marker som kontaktet",
      icon: PhoneCall,
      run: () => updateStudentApplicationStatus(id, "kontaktet"),
      success: "Markert som kontaktet",
    });
  }
  if (status !== "avslatt") {
    actions.push({
      id: "decline",
      label: "Avslå",
      icon: Ban,
      run: () => updateStudentApplicationStatus(id, "avslatt"),
      success: "Innmeldingen er avslått",
      confirm: {
        title: `Avslå innmeldingen for ${name}?`,
        description:
          "Innmeldingen blir liggende i historikken. Familien får ikke beskjed automatisk.",
        confirmLabel: "Avslå",
      },
    });
  }
  if (status !== "arkivert") {
    actions.push({
      id: "archive",
      label: "Arkiver",
      icon: Archive,
      run: () => updateStudentApplicationStatus(id, "arkivert"),
      success: "Innmeldingen er arkivert",
    });
    actions.push({
      id: "spam",
      label: "Marker som spam",
      icon: ShieldAlert,
      destructive: true,
      run: () => markApplicationsAsSpam([id]),
      success: "Markert som spam og arkivert",
      confirm: {
        title: "Marker som spam?",
        description:
          "Innmeldingen arkiveres og merkes som spam i revisjonsloggen. Den slettes ikke.",
        confirmLabel: "Marker som spam",
      },
    });
  }
  if (!paid) {
    actions.push({
      id: "delete",
      label: "Slett innmelding",
      icon: Trash2,
      destructive: true,
      run: () => deleteStudentApplication(id),
      success: "Innmeldingen er slettet",
      confirm: {
        title: `Slette innmeldingen for ${name}?`,
        description:
          "Dette kan ikke angres. Bruk Arkiver hvis du vil beholde historikken.",
        confirmLabel: "Slett innmelding",
      },
    });
  }

  return (
    <RowActionsMenu label={`Flere valg for ${name}`} actions={actions} />
  );
}
