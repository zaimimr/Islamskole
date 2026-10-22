"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Loader2, PhoneCall, ShieldAlert, UserCheck } from "lucide-react";
import {
  bulkUpdateApplicationStatus,
  bulkUpdateTeacherStatus,
} from "@/app/[locale]/admin/actions";
import {
  admitApplications,
  markApplicationsAsSpam,
} from "@/app/[locale]/admin/(admin-only)/register/register-actions";
import {
  classOptionLabel,
  suggestPlacements,
  type PlacementClass,
} from "@/app/[locale]/admin/(admin-only)/register/placement";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SelectField } from "@/components/ui/select-field";

type BulkEntity = "applications" | "teachers";

type StatusOption = { value: string; label: string };

export type AdmitCandidate = {
  id: string;
  name: string;
  age: number | null;
  desiredClass: string | null;
};

export type BulkAdmitOptions = {
  classes: PlacementClass[];
  schoolYear: { id: string; label: string } | null;
  candidates: AdmitCandidate[];
};

const teacherStatuses: StatusOption[] = [
  { value: "ny", label: "Ny" },
  { value: "kontaktet", label: "Kontaktet" },
  { value: "arkivert", label: "Arkivert" },
];

type BulkContextValue = {
  selected: Set<string>;
  allIds: string[];
  toggle: (id: string) => void;
  toggleAll: () => void;
};

const BulkContext = createContext<BulkContextValue | null>(null);

function useBulk() {
  const context = useContext(BulkContext);
  if (!context) {
    throw new Error("Bulk components must be used inside BulkActions");
  }
  return context;
}

export function BulkActions({
  entity,
  ids,
  admit,
  children,
}: {
  entity: BulkEntity;
  ids: string[];
  admit?: BulkAdmitOptions;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === ids.length ? new Set() : new Set(ids),
    );
  }, [ids]);

  function handleApply() {
    if (selected.size === 0) {
      toast.error("Ingen rader valgt");
      return;
    }
    if (!status) {
      toast.error("Velg en status");
      return;
    }
    const targetIds = [...selected];
    startTransition(async () => {
      const result = await bulkUpdateTeacherStatus(targetIds, status);
      if (result.ok) {
        toast.success(`Status oppdatert for ${targetIds.length} rader`);
        setSelected(new Set());
        setStatus("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const value = useMemo<BulkContextValue>(
    () => ({ selected, allIds: ids, toggle, toggleAll }),
    [selected, ids, toggle, toggleAll],
  );

  return (
    <BulkContext.Provider value={value}>
      {selected.size > 0 && entity === "teachers" ? (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b bg-background/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <span className="text-sm text-muted-foreground">
            {selected.size} valgt
          </span>
          <SelectField
            aria-label="Ny status"
            value={status}
            onValueChange={setStatus}
            size="sm"
            placeholder="Velg status"
            className="w-48"
            options={teacherStatuses.map((s) => ({
              value: s.value,
              label: s.label,
            }))}
          />
          <Button size="sm" onClick={handleApply} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Oppdater status
          </Button>
        </div>
      ) : null}
      {selected.size > 0 && entity === "applications" ? (
        <ApplicationBulkBar
          selectedIds={ids.filter((id) => selected.has(id))}
          admit={admit}
          onDone={() => setSelected(new Set())}
        />
      ) : null}
      {children}
    </BulkContext.Provider>
  );
}

export function BulkSelectAll() {
  const { selected, allIds, toggleAll } = useBulk();
  const checked = allIds.length > 0 && selected.size === allIds.length;
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={toggleAll}
      aria-label="Velg alle"
      className="size-5 rounded border-input accent-primary"
    />
  );
}

export function BulkRowCheckbox({ id }: { id: string }) {
  const { selected, toggle } = useBulk();
  return (
    <input
      type="checkbox"
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      aria-label="Velg rad"
      className="size-5 rounded border-input accent-primary"
    />
  );
}

function ApplicationBulkBar({
  selectedIds,
  admit,
  onDone,
}: {
  selectedIds: string[];
  admit?: BulkAdmitOptions;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [admitOpen, setAdmitOpen] = useState(false);
  const [spamOpen, setSpamOpen] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});

  const candidates = useMemo(
    () =>
      (admit?.candidates ?? []).filter((candidate) =>
        selectedIds.includes(candidate.id),
      ),
    [admit, selectedIds],
  );
  const classes = useMemo(() => admit?.classes ?? [], [admit]);

  function openAdmit() {
    const suggestions = suggestPlacements(candidates, classes);
    setChoices(
      Object.fromEntries(
        candidates.map((candidate) => [
          candidate.id,
          suggestions.get(candidate.id) ?? "",
        ]),
      ),
    );
    setAdmitOpen(true);
  }

  const overbooked = classes.filter((item) => {
    if (item.capacity == null) return false;
    const chosen = Object.values(choices).filter((id) => id === item.id).length;
    return chosen > 0 && item.enrolled + chosen > item.capacity;
  });

  function finish(message: string) {
    toast.success(message);
    onDone();
    router.refresh();
  }

  function setStatus(status: string, message: string) {
    startTransition(async () => {
      const result = await bulkUpdateApplicationStatus(selectedIds, status);
      if (result.ok) finish(message);
      else toast.error(result.error);
    });
  }

  function markSpam() {
    startTransition(async () => {
      const result = await markApplicationsAsSpam(selectedIds);
      if (result.ok) {
        setSpamOpen(false);
        finish(`${selectedIds.length} markert som spam og arkivert`);
      } else {
        toast.error(result.error);
      }
    });
  }

  function confirmAdmit() {
    startTransition(async () => {
      const result = await admitApplications(
        candidates.map((candidate) => ({
          applicationId: candidate.id,
          classId: choices[candidate.id] || null,
        })),
        admit?.schoolYear?.id ?? null,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setAdmitOpen(false);
      if (result.failed.length > 0) {
        toast.error(
          `${result.failed.length} kunne ikke tas opp: ${result.failed[0].error}`,
        );
      }
      if (result.admitted > 0) {
        finish(`${result.admitted} tatt opp`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-[#E3DED3] bg-white/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/85 sm:px-5">
        <span className="mr-1 text-sm font-bold">{selectedIds.length} valgt</span>
        {admit ? (
          <Button
            type="button"
            onClick={openAdmit}
            disabled={pending || candidates.length === 0}
            className="min-h-11 rounded-xl px-4 font-bold"
          >
            <UserCheck aria-hidden="true" className="size-4" />
            Ta opp og plasser
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={() => setStatus("kontaktet", "Markert som kontaktet")}
          disabled={pending}
          className="min-h-11 rounded-xl px-3"
        >
          <PhoneCall aria-hidden="true" className="size-4" />
          Kontaktet
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setStatus("arkivert", "Arkivert")}
          disabled={pending}
          className="min-h-11 rounded-xl px-3"
        >
          <Archive aria-hidden="true" className="size-4" />
          Arkiver
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setSpamOpen(true)}
          disabled={pending}
          className="min-h-11 rounded-xl px-3 text-[#8B2F2B] hover:bg-[#FFF2F1]"
        >
          <ShieldAlert aria-hidden="true" className="size-4" />
          Spam
        </Button>
        {pending ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin text-admin-muted" />
        ) : null}
      </div>

      <AlertDialog open={spamOpen} onOpenChange={setSpamOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Marker {selectedIds.length} som spam?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Innmeldingene arkiveres og merkes som spam i revisjonsloggen. De
              slettes ikke.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Avbryt</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={markSpam}
              disabled={pending}
              className="min-h-11"
            >
              Marker som spam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={admitOpen} onOpenChange={setAdmitOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl border-[#E3DED3] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ta opp og plasser {candidates.length}</DialogTitle>
            <DialogDescription>
              {admit?.schoolYear
                ? `Klassene er foreslått ut fra alder, ønske og ledige plasser i ${admit.schoolYear.label}. Endre der det trengs.`
                : "Aktivt skoleår mangler. Barna blir tatt opp uten plass."}
            </DialogDescription>
          </DialogHeader>
          <ul className="grid gap-2">
            {candidates.map((candidate) => (
              <li
                key={candidate.id}
                className="grid gap-2 rounded-xl bg-[#F8F6F0] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,1.2fr)] sm:items-center"
              >
                <label htmlFor={`bulk-class-${candidate.id}`} className="min-w-0">
                  <span className="block truncate font-bold">{candidate.name}</span>
                  <span className="block text-xs text-admin-muted">
                    {[
                      candidate.age != null ? `${candidate.age} år` : "Alder mangler",
                      candidate.desiredClass ? `ønsker ${candidate.desiredClass}` : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </label>
                <SelectField
                  id={`bulk-class-${candidate.id}`}
                  value={choices[candidate.id] ?? ""}
                  disabled={!admit?.schoolYear}
                  onValueChange={(value) =>
                    setChoices((prev) => ({
                      ...prev,
                      [candidate.id]: value,
                    }))
                  }
                  options={[
                    { value: "", label: "Ikke plasser ennå" },
                    ...classes.map((item) => ({
                      value: item.id,
                      label: classOptionLabel(item),
                    })),
                  ]}
                />
              </li>
            ))}
          </ul>
          {overbooked.length > 0 ? (
            <p role="alert" className="rounded-xl bg-[#FFF2F1] p-3 text-sm text-[#8B2F2B]">
              For mange valgt til {overbooked.map((item) => item.name).join(", ")}.
              Velg en annen klasse eller la noen stå uten plass.
            </p>
          ) : null}
          <DialogFooter className="pt-2">
            <Button
              type="button"
              onClick={confirmAdmit}
              disabled={pending || overbooked.length > 0 || candidates.length === 0}
              className="min-h-11 rounded-xl px-5 font-bold"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Ta opp {candidates.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
