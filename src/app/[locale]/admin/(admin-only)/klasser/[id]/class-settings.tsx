"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveClassSettings } from "../class-settings-actions";
import type { ClassRecord } from "@/components/admin/class-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ClassSettings({ schoolClass, enrolled }: { schoolClass: ClassRecord; enrolled: number }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <section className="rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3] sm:p-5">
    <h2 className="font-heading text-xl font-bold">Klasseinfo</h2>
    <p className="mt-1 text-sm tabular-nums text-admin-muted">{enrolled}{schoolClass.capacity != null ? `/${schoolClass.capacity}` : ""} elever</p>
    <form className="mt-4 grid gap-4" onSubmit={(event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      startTransition(async () => {
        const result = await saveClassSettings(schoolClass.id, schoolClass.updated_at ?? "", formData);
        if (!result.ok) { toast.error(result.error); return; }
        toast.success("Klasseinfo er lagret");
        router.refresh();
      });
    }}>
      <div className="grid gap-2"><Label htmlFor="class-name">Klassenavn</Label><Input id="class-name" name="name_no" required maxLength={200} defaultValue={schoolClass.name_no ?? ""} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2"><Label htmlFor="age_min">Alder fra</Label><Input id="age_min" name="age_min" type="number" inputMode="numeric" min={0} max={100} defaultValue={schoolClass.age_min ?? ""} /></div>
        <div className="grid gap-2"><Label htmlFor="age_max">Alder til</Label><Input id="age_max" name="age_max" type="number" inputMode="numeric" min={0} max={100} defaultValue={schoolClass.age_max ?? ""} /></div>
        <div className="col-span-2 grid gap-2"><Label htmlFor="capacity">Kapasitet for klassen</Label><Input id="capacity" name="capacity" type="number" inputMode="numeric" min={0} max={10000} defaultValue={schoolClass.capacity ?? ""} /></div>
      </div>
      <details><summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold">Egen årspris</summary><div className="grid gap-2"><Label htmlFor="class-price">Overstyr årsavgift (kr)</Label><Input id="class-price" name="price" type="number" inputMode="numeric" min={0} max={1000000} placeholder="Bruk årsavgiften" defaultValue={schoolClass.price ?? ""} /></div></details>
      <Button type="submit" disabled={pending} className="min-h-11 justify-self-start">{pending ? "Lagrer" : "Lagre klasseinfo"}</Button>
    </form>
  </section>;
}
