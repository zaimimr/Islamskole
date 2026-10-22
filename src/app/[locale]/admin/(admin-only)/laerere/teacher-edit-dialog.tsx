"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { updateTeacher } from "./teacher-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type EditableTeacher = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  teacher_note: string | null;
};

export function TeacherEditDialog({
  teacher,
  open,
  onOpenChange,
}: {
  teacher: EditableTeacher;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    formData.set("guardian_id", teacher.id);
    startTransition(async () => {
      const result = await updateTeacher(formData);
      if (result.ok) {
        toast.success("Endringene er lagret");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const field = (key: string) => `teacher-${teacher.id}-${key}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">Rediger lærer</DialogTitle>
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
              <Label htmlFor={field("first")}>Fornavn</Label>
              <Input
                id={field("first")}
                name="first_name"
                defaultValue={teacher.first_name ?? ""}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={field("last")}>Etternavn</Label>
              <Input
                id={field("last")}
                name="last_name"
                defaultValue={teacher.last_name ?? ""}
                className="h-11 rounded-xl"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={field("email")}>E-post</Label>
            <Input
              id={field("email")}
              name="email"
              type="email"
              defaultValue={teacher.email ?? ""}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={field("phone")}>Telefon</Label>
            <Input
              id={field("phone")}
              name="phone"
              defaultValue={teacher.phone ?? ""}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={field("note")}>Notat</Label>
            <Input
              id={field("note")}
              name="teacher_note"
              defaultValue={teacher.teacher_note ?? ""}
              placeholder="Fag, rolle eller annet"
              className="h-11 rounded-xl"
            />
          </div>
          <DialogFooter className="[&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:rounded-xl [&_[data-slot=button]]:px-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Avbryt
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Lagre endringer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
