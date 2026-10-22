"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Phone, UserPlus, X } from "lucide-react";
import {
  assignTeacher,
  removeTeacher,
} from "@/app/[locale]/admin/portal-admin-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/admin/status-pill";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ClassTeacher = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  suspended?: boolean;
};

export function ClassTeachers({
  classId,
  yearLabel,
  assigned,
  candidates,
  teachersHref,
}: {
  classId: string;
  yearLabel: string;
  assigned: ClassTeacher[];
  candidates: { id: string; name: string }[];
  teachersHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const [shown, updateShown] = useOptimistic<
    (ClassTeacher & { saving?: boolean })[],
    { type: "add"; teacher: ClassTeacher } | { type: "remove"; id: string }
  >(
    assigned,
    (current, change) =>
      change.type === "add"
        ? [...current, { ...change.teacher, saving: true }]
        : current.filter((teacher) => teacher.id !== change.id),
  );
  const assignedIds = new Set(shown.map((teacher) => teacher.id));
  const available = candidates.filter((teacher) => !assignedIds.has(teacher.id));
  const nameById = new Map(available.map((teacher) => [teacher.id, teacher.name]));

  function add() {
    if (!selected) return;
    const guardianId = selected;
    const name = nameById.get(guardianId) ?? "Læreren";
    setSelected(null);
    startTransition(async () => {
      updateShown({
        type: "add",
        teacher: { id: guardianId, name, phone: null, email: null },
      });
      const result = await assignTeacher(classId, guardianId);
      if (!result.ok) {
        toast.error(result.error);
        setSelected(guardianId);
        return;
      }
      toast.success(`${name} er lagt til`);
      router.refresh();
    });
  }

  function remove(teacher: ClassTeacher) {
    startTransition(async () => {
      updateShown({ type: "remove", id: teacher.id });
      const result = await removeTeacher(classId, teacher.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${teacher.name} er fjernet fra klassen`);
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby="class-teachers-title"
      className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3] print:hidden"
    >
      <div className="border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
        <h2 id="class-teachers-title" className="font-heading text-xl font-bold">
          Lærere
        </h2>
        <p className="mt-0.5 text-sm text-admin-muted">
          Lærerne i {yearLabel} fører oppmøte og skriver ukens notat på Min side.
        </p>
      </div>

      {shown.length ? (
        <ul
          aria-busy={pending}
          className={cn("divide-y divide-[#ECE8DF]", pending && "opacity-80")}
        >
          {shown.map((teacher) => (
            <li
              key={teacher.id}
              className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-5"
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 font-bold">
                  {teacher.name}
                  {teacher.suspended ? (
                    <StatusPill tone="danger">Suspendert</StatusPill>
                  ) : null}
                </span>
                {teacher.phone ? (
                  <a
                    href={`tel:${teacher.phone.replace(/\s+/g, "")}`}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded text-sm font-bold text-[#277A31] underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-0"
                  >
                    <Phone aria-hidden="true" className="size-3.5" />
                    {teacher.phone}
                  </a>
                ) : null}
                {!teacher.email && !teacher.saving ? (
                  <span className="block text-xs text-[#775108]">
                    Mangler e-post, kan ikke logge inn
                  </span>
                ) : null}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => remove(teacher)}
                aria-label={`Fjern ${teacher.name} fra klassen`}
                className="min-h-11 rounded-xl bg-white px-3 font-bold"
              >
                <X aria-hidden="true" className="size-4" />
                Fjern
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-4 text-sm text-admin-muted sm:px-5">
          Ingen lærer er knyttet til klassen ennå.
        </p>
      )}

      <div className="border-t border-[#ECE8DF] bg-[#FBFAF6] px-4 py-4 sm:px-5">
        {available.length ? (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,20rem)_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="class-teacher-select">Legg til lærer</Label>
              <Select value={selected} onValueChange={(value) => setSelected(value)}>
                <SelectTrigger
                  id="class-teacher-select"
                  className="min-h-11 w-full rounded-xl border-[#CFC9BD] bg-white shadow-none"
                >
                  <SelectValue placeholder="Velg lærer">
                    {(value: string | null) =>
                      value ? nameById.get(value) : "Velg lærer"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {available.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              disabled={pending || !selected}
              onClick={add}
              className="min-h-11 rounded-xl bg-admin-action px-4 font-bold text-white hover:bg-[#245E2B]"
            >
              <UserPlus aria-hidden="true" className="size-4" />
              Legg til
            </Button>
          </div>
        ) : (
          <p className="text-sm text-admin-muted">
            {candidates.length
              ? "Alle registrerte lærere er allerede i klassen."
              : "Ingen registrerte lærere. "}
            {candidates.length ? null : (
              <Link
                href={teachersHref}
                className="font-bold text-[#277A31] underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Registrer en lærer
              </Link>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
