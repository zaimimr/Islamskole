"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateStudentLoginEmail } from "./actions";

export function StudentLoginEmail({
  studentId,
  email,
}: {
  studentId: string;
  email: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateStudentLoginEmail(studentId, formData);
      if (result.ok) {
        toast.success("E-posten er lagret");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={pending}
      className="grid gap-2 border-t border-[#ECE8DF] pt-4"
    >
      <Label htmlFor="student_login_email">Elevens e-post (innlogging)</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="student_login_email"
          name="child_email"
          type="email"
          defaultValue={email ?? ""}
          aria-describedby="student_login_email_hint"
          className="min-h-11 rounded-xl border-[#CFC9BD] shadow-none sm:max-w-sm"
        />
        <Button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-xl px-5 font-bold"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save aria-hidden="true" className="size-4" />
          )}
          Lagre endringer
        </Button>
      </div>
      <p id="student_login_email_hint" className="text-xs text-admin-muted">
        Eleven kan logge inn på Min side med denne adressen og se sin egen
        klasse, ukenotater og oppmøte.
      </p>
    </form>
  );
}
