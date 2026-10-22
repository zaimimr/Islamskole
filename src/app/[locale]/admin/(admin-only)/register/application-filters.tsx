"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, ListFilter, SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const statuses = [
  { value: "apne", label: "Til behandling" },
  { value: "ny", label: "Nye" },
  { value: "kontaktet", label: "Kontaktet" },
  { value: "akseptert", label: "Tatt opp, ikke registrert" },
  { value: "avslatt", label: "Avslått" },
  { value: "arkivert", label: "Arkivert" },
  { value: "alle", label: "Alle innmeldinger" },
];

export function ApplicationFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function setParam(key: string, value: string, emptyValue = "") {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== emptyValue) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  function setSearch(value: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setParam("q", value.trim()), 300);
  }

  const status = searchParams.get("status") ?? "apne";
  const activeFilters =
    (searchParams.get("q") ? 1 : 0) + (status !== "apne" ? 1 : 0);

  return (
    <div aria-busy={pending}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="application-filter-fields"
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:hidden"
      >
        <span className="inline-flex items-center gap-2">
          <ListFilter aria-hidden="true" className="size-4 text-[#2F7938]" />
          Søk og filtre
          {activeFilters > 0 ? (
            <span className="rounded-full bg-[#DCEDDD] px-2 py-0.5 text-xs text-[#216A2B]">
              {activeFilters} aktive
            </span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
      </button>
      <div
        id="application-filter-fields"
        className={cn(
          "mt-3 gap-3 sm:mt-0 sm:grid sm:grid-cols-[minmax(0,1fr)_16rem]",
          open ? "grid" : "hidden",
        )}
      >
        <div className="grid gap-1.5">
          <label htmlFor="application-search" className="text-sm font-bold">
            Søk i innmeldinger
          </label>
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[#2F7938]"
            />
            <Input
              id="application-search"
              type="search"
              defaultValue={searchParams.get("q") ?? ""}
              placeholder="Navn, foresatt eller e-post"
              className="min-h-11 rounded-xl border-[#CFC9BD] bg-white pl-10 shadow-none focus-visible:border-[#2F7938] focus-visible:ring-[#2F7938]/20"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  if (timer.current) clearTimeout(timer.current);
                  setParam("q", event.currentTarget.value.trim());
                }
              }}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <span id="application-status-label" className="text-sm font-bold">
            Vis
          </span>
          <Select
            value={status}
            onValueChange={(value) => setParam("status", value ?? "apne", "apne")}
          >
            <SelectTrigger
              aria-labelledby="application-status-label"
              className="min-h-11 w-full rounded-xl border-[#CFC9BD] bg-white shadow-none"
            >
              <ListFilter aria-hidden="true" className="size-4 text-[#2F7938]" />
              <SelectValue>
                {(value: string) =>
                  statuses.find((item) => item.value === value)?.label ??
                  "Til behandling"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {statuses.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
