"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Search } from "lucide-react";

const CommandPaletteDialog = dynamic(
  () =>
    import("@/components/admin/command-palette-dialog").then(
      (mod) => mod.CommandPaletteDialog,
    ),
  { ssr: false },
);

function subscribeNever() {
  return () => {};
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

export function CommandPalette({ basePath }: { basePath: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const isMac = useSyncExternalStore(
    subscribeNever,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => true,
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setLoaded(true);
        setOpen((current) => !current);
        return;
      }
      if (event.key === "/" && !isTypingTarget(event.target)) {
        event.preventDefault();
        setLoaded(true);
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function openPalette() {
    setLoaded(true);
    setOpen(true);
  }

  const shortcut = isMac ? "⌘K" : "Ctrl K";

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        className="hidden min-h-11 w-full items-center gap-3 rounded-xl border border-[#AFCFB3] bg-white pr-2 pl-4 text-left text-sm text-admin-muted outline-none transition-colors hover:border-[#3C8F44] focus-visible:border-[#3C8F44] focus-visible:ring-3 focus-visible:ring-[#3C8F44]/18 lg:flex"
      >
        <Search aria-hidden="true" className="size-[1.125rem] text-[#3C8F44]" />
        <span className="flex-1 truncate">
          Søk etter elev, foresatt, klasse eller Vipps-referanse
        </span>
        <kbd className="rounded-md border border-[#E4E1D8] bg-[#FAF9F5] px-1.5 py-0.5 font-sans text-xs font-bold text-admin-muted">
          {shortcut}
        </kbd>
      </button>
      <button
        type="button"
        onClick={openPalette}
        aria-label="Søk"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#E4E1D8] bg-white text-foreground outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
      >
        <Search aria-hidden="true" className="size-5 text-[#3C8F44]" />
      </button>

      {loaded ? (
        <CommandPaletteDialog
          basePath={basePath}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  );
}
