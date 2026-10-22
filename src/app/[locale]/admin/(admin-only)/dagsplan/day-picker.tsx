"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "@/lib/utils";

export function DayPicker({
  basePath,
  days,
  selectedId,
}: {
  basePath: string;
  days: { id: string; label: string }[];
  selectedId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const index = days.findIndex((day) => day.id === selectedId);
  const previous = index > 0 ? days[index - 1] : null;
  const next = index >= 0 && index < days.length - 1 ? days[index + 1] : null;
  const href = (id: string) => {
    const query = new URLSearchParams(searchParams.toString());
    query.set("dag", id);
    return `${basePath}?${query}`;
  };
  const arrow = cn(buttonVariants({ variant: "outline", size: "icon" }), "size-11 shrink-0 rounded-xl bg-white");

  return (
    <div className="flex items-center gap-2">
      {previous ? (
        <Link href={href(previous.id)} className={arrow} aria-label="Forrige skoledag">
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Link>
      ) : null}
      <SelectField
        aria-label="Skoledag"
        options={days.map((day) => ({ value: day.id, label: day.label }))}
        value={selectedId}
        onValueChange={(value) => startTransition(() => router.push(href(value)))}
        className="min-w-56 flex-1 sm:flex-none"
        triggerClassName="min-h-11 rounded-xl border-[#CFC9BD] bg-white shadow-none"
      />
      {next ? (
        <Link href={href(next.id)} className={arrow} aria-label="Neste skoledag">
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      ) : null}
      {pending ? <Loader2 aria-label="Laster" className="size-4 animate-spin text-admin-muted" /> : null}
    </div>
  );
}
