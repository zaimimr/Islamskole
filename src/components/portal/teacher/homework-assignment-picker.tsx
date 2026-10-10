"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { SelectField } from "@/components/ui/select-field";

export function HomeworkAssignmentPicker({ assignments, selectedId }: {
  assignments: { value: string; label: string }[]; selectedId: string;
}) {
  const en = useLocale() === "en";
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return <SelectField aria-label={en ? "Homework assignment" : "Lekseoppgave"} options={assignments}
    value={selectedId} onValueChange={(id) => {
      const query = new URLSearchParams(search.toString());
      query.set("lekse", id);
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    }} triggerClassName="min-h-11 w-full" />;
}
