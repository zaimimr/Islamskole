"use client";

import { useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { addMaterialLink, finishMaterialUpload, removeLessonMaterial, startMaterialUpload } from "@/lib/portal/material-actions";

export function RemoveMaterialButton({ id, title }: { id: string; title: string }) {
  const en = useLocale() === "en";
  const [pending, startTransition] = useTransition();
  return <Button variant="ghost" size="icon" className="size-11 text-destructive" disabled={pending}
    aria-label={en ? `Remove material: ${title}` : `Fjern materiell: ${title}`}
    onClick={() => startTransition(async () => {
      const result = await removeLessonMaterial(id);
      if (!result.ok) toast.error(en ? "Could not remove material" : "Kunne ikke fjerne materiell");
    })}>
    {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Trash2 aria-hidden="true" className="size-4" />}
  </Button>;
}

export function MaterialEditor({ classId, schoolYearId, lessonId }: {
  classId: string; schoolYearId: string; lessonId: string | null;
}) {
  const en = useLocale() === "en";
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("link");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const formId = `material-${lessonId ?? classId}`;
  const failure = en ? "Could not save material" : "Kunne ikke lagre materiell";

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        if (kind === "link") {
          const result = await addMaterialLink({ classId, schoolYearId, lessonId, title, url });
          if (!result.ok) throw new Error(failure);
        } else {
          if (!file) return;
          const upload = await startMaterialUpload({ classId, schoolYearId, lessonId, title,
            fileName: file.name, size: file.size, mime: file.type as Parameters<typeof startMaterialUpload>[0]["mime"],
          });
          if (!upload.ok) throw new Error(failure);
          const { error } = await createClient().storage.from("lesson-materials")
            .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
          if (error || !(await finishMaterialUpload(upload.id)).ok) {
            await removeLessonMaterial(upload.id);
            throw new Error(failure);
          }
        }
        setOpen(false);
        setTitle("");
        setUrl("");
        setFile(null);
        toast.success(en ? "Material saved" : "Materiell lagret");
      } catch {
        toast.error(failure);
      }
    });
  }

  if (!open) return <Button variant="outline" className="min-h-11 w-fit" onClick={() => setOpen(true)}>
    <Plus aria-hidden="true" className="size-4" />{en ? "Add material" : "Legg til materiell"}
  </Button>;
  return <form onSubmit={submit} className="grid gap-4 rounded-2xl bg-muted/50 p-4">
    <div className="grid gap-2">
      <Label htmlFor={`${formId}-title`}>{en ? "Title" : "Tittel"}</Label>
      <Input id={`${formId}-title`} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} disabled={pending} />
    </div>
    <fieldset disabled={pending} className="flex min-h-11 flex-wrap items-center gap-5">
      <legend className="sr-only">{en ? "Material type" : "Type materiell"}</legend>
      {[{ value: "link", label: en ? "Link" : "Lenke" }, { value: "file", label: en ? "File" : "Fil" }].map((option) => (
        <label key={option.value} className="flex min-h-11 items-center gap-2"><input type="radio" name={`${formId}-kind`} value={option.value} checked={kind === option.value} onChange={() => setKind(option.value)} className="size-5 accent-[var(--brand-green-dark)]" />{option.label}</label>
      ))}
    </fieldset>
    {kind === "link" ? <div className="grid gap-2">
      <Label htmlFor={`${formId}-url`}>{en ? "Link" : "Lenke"}</Label>
      <Input id={`${formId}-url`} type="url" pattern="https?://.+" value={url} onChange={(event) => setUrl(event.target.value)} required disabled={pending} maxLength={2000} />
    </div> : <div className="grid gap-2">
      <Label htmlFor={`${formId}-file`}>{en ? "PDF, image or audio (max 20 MB)" : "PDF, bilde eller lyd (maks 20 MB)"}</Label>
      <input className="min-h-11 w-full min-w-0 rounded-xl border border-input p-2 text-base file:mr-3 file:font-semibold focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50" id={`${formId}-file`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/x-wav,audio/webm" required disabled={pending} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
    </div>}
    <div className="flex gap-2">
      <Button type="submit" className="min-h-11" disabled={pending || !title.trim() || (kind === "file" && !file)}>
        {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}{en ? "Save" : "Lagre"}
      </Button>
      <Button type="button" variant="ghost" className="min-h-11" disabled={pending} onClick={() => setOpen(false)}>{en ? "Cancel" : "Avbryt"}</Button>
    </div>
  </form>;
}
