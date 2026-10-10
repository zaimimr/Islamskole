"use client";

import { matchesSearch } from "@/lib/search";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CornerDownLeft,
  GraduationCap,
  Loader2,
  ReceiptText,
  Search,
  UserRound,
  Users,
} from "lucide-react";
import { searchAdmin, type AdminSearchHit } from "@/app/[locale]/admin/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type PaletteItem = {
  key: string;
  group: string;
  label: string;
  detail: string | null;
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

const destinations = [
  { label: "Arbeidsflate", path: "" },
  { label: "Opptak", path: "/register" },
  { label: "Familier", path: "/familier" },
  { label: "Elever", path: "/elever" },
  { label: "Klasser", path: "/klasser" },
  { label: "Dagsplan", path: "/dagsplan" },
  { label: "Økonomi", path: "/betaling" },
  { label: "Betalingslogg", path: "/betaling/logg" },
  { label: "Skoleår", path: "/skolear" },
  { label: "Aktiviteter", path: "/aktiviteter" },
  { label: "Ny aktivitet", path: "/aktiviteter/ny" },
  { label: "Innstillinger", path: "/innstillinger" },
  { label: "Lærere", path: "/laerere" },
  { label: "Brukere", path: "/brukere" },
  { label: "Revisjonshistorikk", path: "/revisjon" },
  { label: "Min konto", path: "/konto" },
];

const groupIcons: Record<AdminSearchHit["group"], PaletteItem["icon"]> = {
  Familier: Users,
  Elever: UserRound,
  Klasser: GraduationCap,
  Betalinger: ReceiptText,
};

export function CommandPaletteDialog({
  basePath,
  open,
  onOpenChange,
}: {
  basePath: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<AdminSearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const requestId = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const id = ++requestId.current;
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const result = await searchAdmin(term);
        if (id !== requestId.current) return;
        if (result.ok) {
          setHits(result.hits);
          setError(null);
        } else {
          setHits([]);
          setError(result.error);
        }
        setActiveIndex(0);
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const items = useMemo<PaletteItem[]>(() => {
    const term = query.trim().toLocaleLowerCase("nb-NO");
    const navItems = destinations
      .filter((item) =>
        matchesSearch(query, item.label),
      )
      .slice(0, term ? 4 : destinations.length)
      .map((item) => ({
        key: `nav:${item.path}`,
        group: "Gå til",
        label: item.label,
        detail: null,
        href: `${basePath}${item.path}`,
        icon: ArrowRight,
      }));
    const searchItems = (term.length >= 2 ? hits : []).map((hit) => ({
      key: `${hit.group}:${hit.id}:${hit.path}`,
      group: hit.group,
      label: hit.label,
      detail: hit.detail,
      href: `${basePath}${hit.path}`,
      icon: groupIcons[hit.group],
    }));
    const allFamilies = term
      ? [
          {
            key: "search:familier",
            group: "Søk",
            label: `Søk etter «${query.trim()}» i alle familier`,
            detail: null,
            href: `${basePath}/familier?q=${encodeURIComponent(query.trim())}`,
            icon: Search,
          },
        ]
      : [];
    return [...searchItems, ...navItems, ...allFamilies];
  }, [basePath, hits, query]);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setQuery("");
      setHits([]);
      setError(null);
      setActiveIndex(0);
    }
  }

  function go(item: PaletteItem | undefined) {
    if (!item) return;
    handleOpenChange(false);
    router.push(item.href);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(items.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(items[activeIndex]);
    }
  }

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const visibleError = query.trim().length >= 2 ? error : null;
  const activeId = items[activeIndex]
    ? `palette-option-${activeIndex}`
    : undefined;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[12vh] max-h-[76vh] translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-2xl border-[#E3DED3] p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Søk i administrasjonen</DialogTitle>
        <DialogDescription className="sr-only">
          Skriv minst to tegn. Bruk piltastene for å velge og Enter for å
          åpne.
        </DialogDescription>
        <div className="flex items-center gap-3 border-b border-[#ECE8DF] px-4">
          {pending ? (
            <Loader2
              aria-hidden="true"
              className="size-5 shrink-0 animate-spin text-[#3C8F44]"
            />
          ) : (
            <Search
              aria-hidden="true"
              className="size-5 shrink-0 text-[#3C8F44]"
            />
          )}
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Familie, elev, klasse eller Vipps-referanse"
            aria-label="Søk"
            role="combobox"
            aria-expanded="true"
            aria-controls="admin-palette-list"
            aria-activedescendant={activeId}
            autoComplete="off"
            spellCheck={false}
            className="min-h-14 w-full bg-transparent text-base outline-none placeholder:text-admin-muted"
          />
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-2">
          {visibleError ? (
            <p role="alert" className="px-3 py-4 text-sm text-[#8B2F2B]">
              {visibleError}
            </p>
          ) : null}
          {query.trim().length >= 2 &&
          !pending &&
          !visibleError &&
          hits.length === 0 ? (
            <p className="px-3 pt-3 pb-1 text-sm text-admin-muted">
              Ingen familier, elever, klasser eller betalinger passer søket.
            </p>
          ) : null}
          <ul
            id="admin-palette-list"
            ref={listRef}
            role="listbox"
            aria-label="Treff"
            className="grid gap-0.5"
          >
            {items.map((item, index) => {
              const Icon = item.icon;
              const showGroup =
                index === 0 || items[index - 1].group !== item.group;
              return (
                <li key={item.key} role="presentation">
                  {showGroup ? (
                    <p
                      aria-hidden="true"
                      className="px-3 pt-3 pb-1 text-xs font-bold text-admin-muted"
                    >
                      {item.group}
                    </p>
                  ) : null}
                  <div
                    id={`palette-option-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => go(item)}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm",
                      index === activeIndex
                        ? "bg-[#EEF6EE] text-[#163B1C]"
                        : "text-foreground",
                    )}
                  >
                    <Icon
                      aria-hidden={true}
                      className="size-4 shrink-0 text-[#3C8F44]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">
                        {item.label}
                      </span>
                      {item.detail ? (
                        <span className="block truncate text-xs text-admin-muted">
                          {item.detail}
                        </span>
                      ) : null}
                    </span>
                    {index === activeIndex ? (
                      <CornerDownLeft
                        aria-hidden="true"
                        className="size-4 shrink-0 text-admin-muted"
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
