"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { addUserWithRole } from "@/app/[locale]/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";

export function GrantAdminForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(addUserWithRole, null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success("Tilgang gitt. Innloggingslenken er sendt.");
    else toast.error(state.error);
    router.refresh();
  }, [state, router]);

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3] sm:p-5">
      <form
        action={formAction}
        aria-labelledby="grant-admin-title"
        className="grid gap-4"
      >
        <h2 id="grant-admin-title" className="font-heading text-xl font-bold">
          Legg til bruker
        </h2>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,12rem)_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="grant-full-name">Navn</Label>
            <Input
              id="grant-full-name"
              name="full_name"
              placeholder="Fullt navn"
              autoComplete="off"
              className="shadow-none"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="grant-email" required>
              E-post
            </Label>
            <Input
              id="grant-email"
              name="email"
              type="email"
              required
              placeholder="navn@eksempel.no"
              autoComplete="off"
              spellCheck={false}
              className="shadow-none"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="grant-role" required>
              Rolle
            </Label>
            <SelectField
              id="grant-role"
              name="role"
              defaultValue="sfo"
              required
              options={[
                { value: "sfo", label: "SFO" },
                { value: "admin", label: "Administrator" },
              ]}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <UserPlus aria-hidden="true" className="size-4" />
            )}
            Legg til
          </Button>
        </div>
      </form>
    </section>
  );
}
