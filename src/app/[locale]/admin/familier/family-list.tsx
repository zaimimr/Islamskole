"use client";

import { matchesSearch } from "@/lib/search";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  Mail,
  MapPin,
  Search,
  Users,
} from "lucide-react";
import { formatNok } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { familyQueues, type FamilyQueueId } from "./family-queues";

export type FamilyListRow = {
  id: string;
  displayName: string;
  childCount: number;
  addressLine: string | null;
  flags: string[];
  primaryName: string;
  primaryEmail: string | null;
  remainingOre: number;
  queues: FamilyQueueId[];
  searchText: string;
};

const PAGE_SIZE = 25;

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("nb-NO");
}

export function FamilyList({
  rows,
  basePath,
  initialQuery,
  initialQueue,
  initialPage,
}: {
  rows: FamilyListRow[];
  basePath: string;
  initialQuery: string;
  initialQueue: string;
  initialPage: number;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [queue, setQueue] = useState<FamilyQueueId>(
    familyQueues.find((item) => item.id === initialQueue)?.id ?? "",
  );
  const [page, setPage] = useState(initialPage);

  function update(nextQuery: string, nextQueue: FamilyQueueId, nextPage: number) {
    setQuery(nextQuery);
    setQueue(nextQueue);
    setPage(nextPage);
    const params = new URLSearchParams(window.location.search);
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    else params.delete("q");
    if (nextQueue) params.set("vis", nextQueue);
    else params.delete("vis");
    if (nextPage > 1) params.set("page", String(nextPage));
    else params.delete("page");
    const search = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}`,
    );
  }

  const term = normalized(query);
  const searched = term
    ? rows.filter((row) => matchesSearch(query, row.searchText))
    : rows;
  const inQueue = (row: FamilyListRow, id: FamilyQueueId) =>
    !id || row.queues.includes(id);
  const families = searched.filter((row) => inQueue(row, queue));
  const pageCount = Math.max(1, Math.ceil(families.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleFamilies = families.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <>
      <section className="grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3] sm:p-5">
        <div role="search">
          <label htmlFor="family-search" className="text-sm font-bold">
            Finn familie, foresatt eller barn
          </label>
          <div className="relative mt-2">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-[#2F7938]"
            />
            <input
              id="family-search"
              type="search"
              value={query}
              onChange={(event) => update(event.target.value, queue, 1)}
              autoComplete="off"
              placeholder="For eksempel Rahman, 900 00 000 eller Haslum"
              className="min-h-11 w-full rounded-xl border border-[#AFCFB3] bg-white pr-4 pl-11 text-base outline-none placeholder:text-admin-muted focus-visible:border-[#2F7938] focus-visible:ring-3 focus-visible:ring-[#2F7938]/20 sm:text-sm"
            />
          </div>
        </div>
        <nav aria-label="Arbeidskøer" className="-mx-1 overflow-x-auto px-1">
          <ul className="flex min-w-max gap-2">
            {familyQueues.map((item) => {
              const current = item.id === queue;
              return (
                <li key={item.id || "alle"}>
                  <button
                    type="button"
                    onClick={() => update(query, item.id, 1)}
                    aria-pressed={current}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-bold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                      current
                        ? "border-[#2F7938] bg-[#F0F8F1] text-[#216A2B]"
                        : "border-[#D8D3C8] bg-white hover:bg-[#F2F1EB]",
                    )}
                  >
                    {item.label}
                    <span className="tabular-nums text-admin-muted">
                      {searched.filter((row) => inQueue(row, item.id)).length}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </section>

      <p className="text-sm text-admin-muted" aria-live="polite">
        {families.length} {families.length === 1 ? "familie" : "familier"}
        {term ? ` for «${query.trim()}»` : ""}
      </p>

      {families.length === 0 ? (
        <section className="flex min-h-64 flex-col items-center justify-center rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-[#E3DED3]">
          <span className="flex size-12 items-center justify-center rounded-full bg-[#DCEDDD] text-[#216A2B]">
            <Users aria-hidden="true" className="size-6" />
          </span>
          <h2 className="mt-4 font-heading text-xl font-bold">
            {term || queue ? "Ingen familier her" : "Ingen familier ennå"}
          </h2>
          <p className="mt-1 max-w-md text-sm text-admin-muted">
            {queue
              ? "Køen er tom. Velg en annen kø eller Alle."
              : term
                ? "Prøv et annet navn, telefonnummer eller en annen adresse."
                : "Familier opprettes automatisk ved offentlig innmelding eller når en elev registreres manuelt."}
          </p>
        </section>
      ) : (
        <ul className="grid gap-3">
          {visibleFamilies.map((family) => (
            <li key={family.id}>
              <Link
                href={`${basePath}/familier/${family.id}`}
                className="group grid gap-3 rounded-2xl bg-white p-4 outline-none ring-1 ring-[#E3DED3] transition-colors hover:bg-[#FBFAF6] focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[minmax(0,1.2fr)_minmax(12rem,0.8fr)_auto] sm:items-center sm:gap-4 sm:p-5"
              >
                <span className="min-w-0">
                  <span className="block truncate font-heading text-lg font-bold">
                    {family.displayName}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-admin-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Users aria-hidden="true" className="size-4" />
                      {family.childCount} barn
                    </span>
                    {family.addressLine ? (
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <MapPin aria-hidden="true" className="size-4 shrink-0" />
                        <span className="truncate">{family.addressLine}</span>
                      </span>
                    ) : null}
                  </span>
                  {family.flags.length > 0 ? (
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {family.flags.map((flag) => (
                        <span
                          key={flag}
                          className="inline-flex min-h-7 items-center gap-1 rounded-full bg-[#FEEDCA] px-2.5 text-xs font-bold text-[#775108]"
                        >
                          {flag === "Mulig duplikat" ? (
                            <Copy aria-hidden="true" className="size-3.5" />
                          ) : (
                            <CircleAlert aria-hidden="true" className="size-3.5" />
                          )}
                          {flag}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>

                <span className="min-w-0 text-sm">
                  <span className="block font-bold">{family.primaryName}</span>
                  {family.primaryEmail ? (
                    <span className="mt-1 flex min-w-0 items-center gap-1.5 text-admin-muted">
                      <Mail aria-hidden="true" className="size-4 shrink-0" />
                      <span className="truncate">{family.primaryEmail}</span>
                    </span>
                  ) : null}
                </span>

                <span className="flex items-center justify-between gap-3 sm:justify-end">
                  {family.remainingOre > 0 ? (
                    <span className="text-sm font-bold tabular-nums text-[#8B2F2B]">
                      Skylder {formatNok(family.remainingOre)}
                    </span>
                  ) : (
                    <span className="text-sm font-bold text-[#216A2B]">
                      Ingen utestående
                    </span>
                  )}
                  <ArrowRight
                    aria-hidden="true"
                    className="size-5 shrink-0 text-admin-muted transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {families.length > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3]">
          <p className="text-sm text-muted-foreground">
            Side {currentPage} av {pageCount} · {families.length} totalt
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => update(query, queue, currentPage - 1)}
            >
              <ChevronLeft className="size-4" />
              Forrige
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= pageCount}
              onClick={() => update(query, queue, currentPage + 1)}
            >
              Neste
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
