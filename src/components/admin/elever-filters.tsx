"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  CalendarDays,
  ChevronDown,
  CreditCard,
  ListFilter,
  SearchIcon,
  UsersRound,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const paymentStatuses = [
  { value: "alle", label: "Alle betalingsstatuser" },
  { value: "ikke_betalt", label: "Skylder" },
  { value: "betalt", label: "Betalt" },
  { value: "fritatt", label: "Fritatt" },
  { value: "delvis", label: "Delvis betalt" },
  { value: "venter", label: "Lenke sendt, venter" },
  { value: "ubetalt", label: "Ikke betalt, ingen lenke" },
  { value: "ingen_krav", label: "Plassert uten krav" },
];

export function EleverFilters({
  classes,
  schoolYears,
  activeYearId,
}: {
  classes: { id: string; name: string }[];
  schoolYears: { id: string; label: string }[];
  activeYearId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function apply(update: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    update(params);
    params.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  function setParam(key: string, value: string, emptyValue = "alle") {
    apply((params) => {
      if (key === "betaling") params.delete("pay");
      if (value && value !== emptyValue) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
  }

  function setSearch(value: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setParam("q", value.trim(), ""), 300);
  }

  const defaultYear = activeYearId ?? "alle";
  const yearValue = searchParams.get("year") ?? defaultYear;
  const classValue = searchParams.get("class") ?? "alle";
  const payValue =
    searchParams.get("betaling") ?? searchParams.get("pay") ?? "alle";

  const yearLabel = (v: string) =>
    v === "alle"
      ? "Alle skoleår"
      : v === "needs_rollover"
        ? "Mangler plass i aktivt skoleår"
        : v === "avsluttet"
          ? "Har sluttet"
          : (schoolYears.find((y) => y.id === v)?.label ?? "Alle skoleår");
  const classLabel = (v: string) =>
    v === "alle"
      ? "Alle klasser"
      : (classes.find((c) => c.id === v)?.name ?? "Alle klasser");
  const payLabel = (v: string) =>
    paymentStatuses.find((s) => s.value === v)?.label ??
    "Alle betalingsstatuser";

  const activeFilters =
    (searchParams.get("q") ? 1 : 0) +
    (yearValue !== defaultYear ? 1 : 0) +
    (classValue !== "alle" ? 1 : 0) +
    (payValue !== "alle" ? 1 : 0);

  return (
    <div aria-busy={pending}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="elever-filter-fields"
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
        id="elever-filter-fields"
        className={cn(
          "mt-3 gap-3 pb-2 sm:mt-0 sm:grid sm:grid-cols-2 sm:pb-0 xl:grid-cols-4 xl:items-end",
          open ? "grid" : "hidden",
        )}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="elever-sok">Søk</Label>
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[#2F7938]"
            />
            <Input
              id="elever-sok"
              type="search"
              defaultValue={searchParams.get("q") ?? ""}
              placeholder="Navn, foresatt eller e-post"
              className="min-h-11 rounded-xl border-[#CFC9BD] bg-white pl-10 shadow-none focus-visible:border-[#2F7938] focus-visible:ring-[#2F7938]/20"
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (timer.current) clearTimeout(timer.current);
                  setParam("q", e.currentTarget.value.trim(), "");
                }
              }}
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="elever-school-year">Skoleår</Label>
          <Select
            value={yearValue}
            onValueChange={(value) =>
              setParam("year", value ?? defaultYear, defaultYear)
            }
          >
            <SelectTrigger
              id="elever-school-year"
              className="min-h-11 w-full rounded-xl border-[#CFC9BD] bg-white shadow-none"
            >
              <CalendarDays aria-hidden="true" className="size-4 text-[#2F7938]" />
              <SelectValue>{(v: string) => yearLabel(v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {schoolYears.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.label}
                  {y.id === activeYearId ? " (aktivt)" : ""}
                </SelectItem>
              ))}
              <SelectItem value="needs_rollover">
                Mangler plass i aktivt skoleår
              </SelectItem>
              <SelectItem value="avsluttet">Har sluttet</SelectItem>
              <SelectItem value="alle">Alle skoleår</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="elever-class">Klasse</Label>
          <Select
            value={classValue}
            onValueChange={(value) => setParam("class", value ?? "alle")}
          >
            <SelectTrigger
              id="elever-class"
              className="min-h-11 w-full rounded-xl border-[#CFC9BD] bg-white shadow-none"
            >
              <UsersRound aria-hidden="true" className="size-4 text-[#2F7938]" />
              <SelectValue>{(v: string) => classLabel(v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle klasser</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="elever-payment">Betaling</Label>
          <Select
            value={payValue}
            onValueChange={(value) => setParam("betaling", value ?? "alle")}
          >
            <SelectTrigger
              id="elever-payment"
              className="min-h-11 w-full rounded-xl border-[#CFC9BD] bg-white shadow-none"
            >
              <CreditCard aria-hidden="true" className="size-4 text-[#2F7938]" />
              <SelectValue>{(v: string) => payLabel(v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {paymentStatuses.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
