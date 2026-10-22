"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { GraduationCap, Loader2, Plus } from "lucide-react";
import { registerTeacher } from "@/app/[locale]/admin/(admin-only)/familier/families-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function TeacherRegisterDialog({
  sourceApplicationId,
  defaultName,
  defaultEmail,
  defaultPhone,
  compact,
}: {
  sourceApplicationId?: string;
  defaultName?: string | null;
  defaultEmail?: string | null;
  defaultPhone?: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const nameParts = (defaultName ?? "").trim().split(/\s+/);
  const defaultFirst = nameParts.slice(0, -1).join(" ") || nameParts[0] || "";
  const defaultLast =
    nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";

  function submit(formData: FormData) {
    if (sourceApplicationId) {
      formData.set("source_application_id", sourceApplicationId);
    }
    formData.set("locale", locale);
    startTransition(async () => {
      const result = await registerTeacher(formData);
      if (result.ok) {
        toast.success(
          result.linkedName
            ? `${result.linkedName} er koblet til og registrert som lærer`
            : "Læreren er registrert",
        );
        if (result.inviteError) toast.error(result.inviteError);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          compact ? (
            <Button
              variant="ghost"
              className="min-h-11 rounded-lg px-3 text-sm font-bold text-[#277A31]"
            >
              <GraduationCap className="size-3.5" />
              Registrer som lærer
            </Button>
          ) : (
            <Button className="min-h-11 rounded-xl px-4 font-bold">
              <Plus className="size-4" />
              Legg til lærer
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">
            Registrer lærer
          </DialogTitle>
          <DialogDescription>
            Finnes det en foresatt med samme e-postadresse, kobles læreren til
            den foresatte, slik at barna kan tagges som lærerbarn.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(new FormData(event.currentTarget));
          }}
          className="grid gap-3 py-2"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="teacher-first-name" required>
                Fornavn
              </Label>
              <Input
                id="teacher-first-name"
                name="first_name"
                required
                defaultValue={defaultFirst}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="teacher-last-name">Etternavn</Label>
              <Input
                id="teacher-last-name"
                name="last_name"
                defaultValue={defaultLast}
                className="h-11 rounded-xl"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="teacher-email">E-post</Label>
            <Input
              id="teacher-email"
              name="email"
              type="email"
              defaultValue={defaultEmail ?? ""}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="teacher-phone">Telefon</Label>
            <Input
              id="teacher-phone"
              name="phone"
              defaultValue={defaultPhone ?? ""}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="teacher-note">Notat</Label>
            <Input
              id="teacher-note"
              name="teacher_note"
              placeholder="Fag, rolle eller annet"
              className="h-11 rounded-xl"
            />
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm font-bold">
            <input
              type="checkbox"
              name="send_login_link"
              defaultChecked
              className="size-4 accent-[#3C8F44]"
            />
            Send innloggingslenke nå
          </label>
          <DialogFooter className="[&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:rounded-xl [&_[data-slot=button]]:px-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Avbryt
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Registrer lærer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
