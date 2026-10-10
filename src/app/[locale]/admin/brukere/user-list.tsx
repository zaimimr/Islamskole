"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, SearchIcon, Users } from "lucide-react";
import { formatOsloDate } from "@/lib/dates";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusPill } from "@/components/admin/status-pill";
import { OptimisticRemovalList } from "@/components/admin/optimistic-removal-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { hasAdminRole } from "@/lib/impersonation/constants";
import { UserRowActions } from "./user-row-actions";

export type AdminUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  isTeacher: boolean;
  isGuardian: boolean;
  isStudent: boolean;
  lastSignInAt: string | null;
};

const PAGE_SIZE = 25;

const roleFilters = [
  { value: "admin", label: "Admin", match: (user: AdminUser) => hasAdminRole(user.role) },
  { value: "alle", label: "Alle", match: () => true },
  { value: "laerer", label: "Lærere", match: (user: AdminUser) => user.isTeacher },
  { value: "foresatt", label: "Foresatte", match: (user: AdminUser) => user.isGuardian },
  { value: "elev", label: "Elever", match: (user: AdminUser) => user.isStudent },
];

export function UserList({
  allUsers,
  currentId,
  canImpersonate,
  initialRole,
  initialQuery,
  initialPage,
}: {
  allUsers: AdminUser[];
  currentId: string | null;
  canImpersonate: boolean;
  initialRole: string;
  initialQuery: string;
  initialPage: number;
}) {
  const [role, setRole] = useState(
    roleFilters.some((filter) => filter.value === initialRole)
      ? initialRole
      : roleFilters[0].value,
  );
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(initialPage);

  function update(nextRole: string, nextQuery: string, nextPage: number) {
    setRole(nextRole);
    setQuery(nextQuery);
    setPage(nextPage);
    const params = new URLSearchParams(window.location.search);
    if (nextRole !== roleFilters[0].value) params.set("rolle", nextRole);
    else params.delete("rolle");
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    else params.delete("q");
    if (nextPage > 1) params.set("page", String(nextPage));
    else params.delete("page");
    const search = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}`,
    );
  }

  const term = query.trim().toLowerCase();
  const activeRole =
    roleFilters.find((filter) => filter.value === role) ?? roleFilters[0];
  const searched = term
    ? allUsers.filter((user) =>
        `${user.fullName ?? ""} ${user.email}`.toLowerCase().includes(term),
      )
    : allUsers;
  const filtered = searched.filter(activeRole.match);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const users = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <section
      aria-labelledby="user-access-title"
      className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]"
    >
      <div className="grid gap-4 border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 id="user-access-title" className="font-heading text-xl font-bold">
            Innlogginger
          </h2>
          <div className="w-full lg:max-w-sm">
            <label htmlFor="user-search" className="sr-only">
              Søk etter bruker
            </label>
            <div className="relative">
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[#2F7938]"
              />
              <Input
                id="user-search"
                type="search"
                value={query}
                onChange={(event) => update(role, event.target.value, 1)}
                placeholder="Søk på navn eller e-post"
                className="min-h-11 rounded-xl border-[#CFC9BD] bg-white pl-10 shadow-none focus-visible:border-[#2F7938] focus-visible:ring-[#2F7938]/20"
              />
            </div>
          </div>
        </div>
        <nav aria-label="Filtrer på rolle" className="-mx-1 overflow-x-auto">
          <ul className="flex gap-1 px-1">
            {roleFilters.map((filter) => {
              const active = filter.value === role;
              const count = searched.filter(filter.match).length;
              return (
                <li key={filter.value}>
                  <button
                    type="button"
                    onClick={() => update(filter.value, query, 1)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      active
                        ? "bg-[#DCEDDD] text-[#216A2B]"
                        : "text-admin-muted hover:bg-[#F4F1EA] hover:text-foreground",
                    )}
                  >
                    {filter.label}
                    <span className="tabular-nums opacity-70">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      {users.length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden="true" />}
          title="Ingen brukere funnet"
          description={
            term || role !== "alle"
              ? "Prøv et annet søk eller en annen rolle."
              : "Gi noen administratortilgang for å komme i gang."
          }
        />
      ) : (
        <OptimisticRemovalList
          className="divide-y divide-[#ECE8DF]"
          itemClassName="flex items-center gap-3 px-4 py-3 sm:px-5"
          rows={users.map((user) => ({
            id: user.id,
            content: (
              <>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-bold">
                    <span className="break-all">{user.fullName ?? user.email}</span>
                    {user.id === currentId ? (
                      <StatusPill tone="info">Din konto</StatusPill>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-sm text-admin-muted">
                    {user.fullName ? (
                      <span className="break-all">{user.email} · </span>
                    ) : null}
                    {user.lastSignInAt
                      ? `Sist inne ${formatOsloDate(user.lastSignInAt)}`
                      : "Aldri logget inn"}
                  </p>
                </div>
                <div className="hidden shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex">
                  {hasAdminRole(user.role) ? (
                    <StatusPill tone="ok">{user.role === "developer" ? "Utvikler" : "Admin"}</StatusPill>
                  ) : null}
                  {user.isTeacher ? (
                    <StatusPill tone="info">Lærer</StatusPill>
                  ) : null}
                  {user.isGuardian ? (
                    <StatusPill tone="neutral">Foresatt</StatusPill>
                  ) : null}
                  {user.isStudent ? (
                    <StatusPill tone="neutral">Elev</StatusPill>
                  ) : null}
                </div>
                <UserRowActions
                  userId={user.id}
                  email={user.email}
                  isSelf={user.id === currentId}
                  isAdmin={user.role === "admin"}
                  isTeacher={user.isTeacher}
                  canImpersonate={canImpersonate}
                  isDeveloper={user.role === "developer"}
                />
              </>
            ),
          }))}
        />
      )}
      {filtered.length > 0 ? (
        <div className="flex items-center justify-between gap-3 border-t p-4">
          <p className="text-sm text-muted-foreground">
            Side {currentPage} av {totalPages} · {filtered.length} totalt
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => update(role, query, currentPage - 1)}
            >
              <ChevronLeft className="size-4" />
              Forrige
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => update(role, query, currentPage + 1)}
            >
              Neste
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
