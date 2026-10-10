"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitMerge, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatNok } from "@/lib/money";
import {
  reviewChildMerge,
  type ChildMergePreview,
} from "./child-merge-actions";

export type ChildMergeOption = {
  id: string;
  type: "student" | "application";
  name: string;
  description: string;
};

const fieldLabels: Record<string, string> = {
  child_first_name: "Fornavn",
  child_last_name: "Etternavn",
  child_birth_date: "Fødselsdato",
  child_gender: "Kjønn",
  child_email: "E-post for innlogging",
  child_phone: "Telefon",
  child_address: "Adresse",
  child_postal_code: "Postnummer",
  child_city: "Poststed",
  child_level_quran: "Nivå i Koran",
  child_level_arabic: "Nivå i arabisk",
  child_level_islam: "Nivå i islam",
  mother_first_name: "Foresatt 1, fornavn",
  mother_last_name: "Foresatt 1, etternavn",
  mother_phone: "Foresatt 1, telefon",
  mother_email: "Foresatt 1, e-post",
  father_first_name: "Foresatt 2, fornavn",
  father_last_name: "Foresatt 2, etternavn",
  father_phone: "Foresatt 2, telefon",
  father_email: "Foresatt 2, e-post",
};
const buttonClass = "min-h-11 rounded-xl font-bold";

export function ChildMergeDialog({ options }: { options: ChildMergeOption[] }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [keepId, setKeepId] = useState("");
  const [sourceKey, setSourceKey] = useState("");
  const [preview, setPreview] = useState<ChildMergePreview | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const students = options.filter((option) => option.type === "student");
  const sources = options.filter((option) => option.id !== keepId);
  const keptStudent = students.find((option) => option.id === keepId);
  const selectedSource = sources.find(
    (option) => `${option.type}:${option.id}` === sourceKey,
  );
  if (students.length === 0 || options.length < 2) return null;

  function selectKeep(value: string) {
    setKeepId(value);
    setSourceKey("");
    setPreview(null);
    setError("");
  }

  function review(confirm = false) {
    const source = sources.find(
      (option) => `${option.type}:${option.id}` === sourceKey,
    );
    if (!keepId || !source) return;
    setError("");
    startTransition(async () => {
      try {
        const result = await reviewChildMerge({
          keepId,
          sourceId: source.id,
          sourceType: source.type,
          ...(confirm && preview ? { token: preview.token } : {}),
        });
        if (!result.ok) {
          setError(result.error);
          setPreview(null);
          return;
        }
        if (result.preview.merged) {
          toast.success("Barna er slått sammen");
          setOpen(false);
          setPreview(null);
          setKeepId("");
          setSourceKey("");
          router.refresh();
        } else setPreview(result.preview);
      } catch {
        setError("Kunne ikke fullføre. Prøv igjen.");
        setPreview(null);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        setOpen(value);
        if (!value) {
          setPreview(null);
          setError("");
        }
      }}
    >
      <DialogTrigger
        render={<Button variant="outline" className={buttonClass} />}
      >
        <GitMerge aria-hidden="true" className="size-4" />
        Slå sammen barn
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-lg"
        closeLabel="Lukk sammenslåing"
        showCloseButton={!pending}
      >
        <DialogHeader>
          <DialogTitle>Slå sammen barn</DialogTitle>
          <DialogDescription>
            Klasse, betalinger og historikk samles på eleven du beholder.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label id={`${id}-keep`}>Elev som beholdes</Label>
            <SelectField
              aria-labelledby={`${id}-keep`}
              value={keepId}
              onValueChange={selectKeep}
              disabled={pending}
              placeholder="Velg elev"
              options={students.map((option) => ({
                value: option.id,
                label: option.name,
                description: option.description,
              }))}
            />
            {keptStudent && (
              <p className="text-xs text-admin-muted">
                {keptStudent.description}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label id={`${id}-source`}>Duplikat som slås inn</Label>
            <SelectField
              aria-labelledby={`${id}-source`}
              value={sourceKey}
              disabled={pending || !keepId}
              placeholder="Velg elev eller innmelding"
              onValueChange={(value) => {
                setSourceKey(value);
                setPreview(null);
                setError("");
              }}
              options={sources.map((option) => ({
                value: `${option.type}:${option.id}`,
                label: option.name,
                description: option.description,
              }))}
            />
            {selectedSource && (
              <p className="text-xs text-admin-muted">
                {selectedSource.description}
              </p>
            )}
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-[#F9DEDB] p-3 text-[#8B2F2B]"
            >
              {error}
            </p>
          )}
          {preview && (
            <div
              className="grid gap-4 border-t border-[#ECE8DF] pt-4"
              aria-live="polite"
            >
              <p className="font-bold">Samlet elev: {preview.keepName}</p>
              {preview.classes.length > 0 && (
                <dl className="grid gap-2">
                  {preview.classes.map((placement, index) => (
                    <div key={index} className="flex justify-between gap-4">
                      <dt className="text-admin-muted">{placement.year}</dt>
                      <dd className="font-bold">{placement.class}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {preview.finances.map((finance) => (
                <div key={finance.year} className="rounded-xl bg-[#FAF9F5] p-4">
                  <p className="mb-3 font-bold">Kontingent {finance.year}</p>
                  <dl className="grid grid-cols-3 gap-3 tabular-nums">
                    <div>
                      <dt className="text-admin-muted">Krav</dt>
                      <dd className="mt-1 font-bold">
                        {formatNok(finance.owed)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-admin-muted">Betalt</dt>
                      <dd className="mt-1 font-bold">
                        {formatNok(finance.paid)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-admin-muted">Gjenstår</dt>
                      <dd className="mt-1 font-bold">
                        {formatNok(finance.remaining)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
              {preview.fields.length > 0 && (
                <details>
                  <summary className="cursor-pointer py-2 font-bold">
                    Opplysninger som beholdes ({preview.fields.length})
                  </summary>
                  <p className="py-2 text-admin-muted">
                    Tomme felt fylles fra duplikatet. Andre verdier blir stående
                    på eleven du beholder.
                  </p>
                  <dl className="grid gap-3 pt-2">
                    {preview.fields.map((field) => (
                      <div key={field.field}>
                        <dt className="text-admin-muted">
                          {fieldLabels[field.field] ?? field.field}
                        </dt>
                        <dd className="break-words font-bold">{field.kept}</dd>
                        {field.kept !== field.other && (
                          <dd className="break-words text-admin-muted">
                            Duplikat: {field.other}
                          </dd>
                        )}
                      </div>
                    ))}
                  </dl>
                </details>
              )}
              {preview.conflicts.length > 0 && (
                <ul
                  role="alert"
                  className="grid gap-2 rounded-xl bg-[#F9DEDB] p-3 text-[#8B2F2B]"
                >
                  {preview.conflicts.map((conflict) => (
                    <li key={conflict}>{conflict}</li>
                  ))}
                </ul>
              )}
              {preview.conflicts.length === 0 && (
                <p className="text-admin-muted">
                  {selectedSource?.type === "student"
                    ? "Duplikatelevens oppføring fjernes."
                    : "Duplikatinnmeldingen arkiveres."}{" "}
                  Dette kan ikke angres automatisk. Historikken bevares i
                  revisjonsloggen.
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            disabled={pending}
            className={buttonClass}
            onClick={() => setOpen(false)}
          >
            Avbryt
          </Button>
          <Button
            className={`${buttonClass} bg-admin-action text-white hover:bg-admin-action/90`}
            disabled={
              pending ||
              !keepId ||
              !sourceKey ||
              Boolean(preview?.conflicts.length)
            }
            onClick={() => review(Boolean(preview))}
          >
            {pending && (
              <Loader2
                aria-hidden="true"
                className="size-4 animate-spin motion-reduce:animate-none"
              />
            )}
            {pending
              ? "Behandler …"
              : preview
                ? "Bekreft sammenslåing"
                : "Vis forhåndsvisning"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
