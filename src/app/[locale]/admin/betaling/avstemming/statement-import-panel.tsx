"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCheck,
  CloudDownload,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { formatOsloDate } from "@/lib/dates";
import type { ImportSummary } from "@/lib/reconciliation";
import { cn } from "@/lib/utils";
import {
  fetchFromVipps,
  importStatementFile,
  inspectStatementFile,
  type StatementPreview,
} from "./reconciliation-actions";

type Mode = "file" | "vipps" | "history";
const modes: { value: Mode; label: string }[] = [
  { value: "file", label: "Last opp fil" },
  { value: "vipps", label: "Hent fra Vipps" },
  { value: "history", label: "Historikk" },
];
const actionClass = "min-h-11 rounded-xl px-4 font-bold";

export function ImportPanel({
  vippsAccounts,
  history,
}: {
  vippsAccounts: { value: string; label: string }[];
  history: ReactNode;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const inspection = useRef(0);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [source, setSource] = useState("auto");
  const [account, setAccount] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [inspecting, startInspect] = useTransition();
  const [uploading, startUpload] = useTransition();
  const [fetching, startFetch] = useTransition();
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [fetched, setFetched] = useState<
    | {
        msn: string;
        inserted: number;
        duplicates: number;
        error: string | null;
      }[]
    | null
  >(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const busy = uploading || fetching;

  function formData(
    selectedFile: File,
    selectedSource: string,
    selectedAccount: string,
  ) {
    const data = new FormData();
    data.set("file", selectedFile);
    data.set("source", selectedSource);
    data.set("account", selectedAccount);
    return data;
  }

  function inspect(
    selectedFile: File,
    selectedSource = "auto",
    selectedAccount = "",
  ) {
    const request = ++inspection.current;
    setError("");
    startInspect(async () => {
      try {
        const result = await inspectStatementFile(
          formData(selectedFile, selectedSource, selectedAccount),
        );
        if (request !== inspection.current) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setPreview(result.preview);
      } catch {
        if (request === inspection.current)
          setError("Filen kunne ikke leses. Prøv igjen.");
      }
    });
  }

  function selectFile(selected: File | undefined) {
    if (!selected || busy) return;
    setFile(selected);
    setPreview(null);
    setSource("auto");
    setAccount("");
    setSummary(null);
    if (selected.size === 0 || selected.size > 4 * 1024 * 1024) {
      inspection.current++;
      setError(
        selected.size === 0
          ? "Filen er tom. Velg en annen fil."
          : "Filen er for stor. Maks 4 MB.",
      );
      return;
    }
    inspect(selected);
  }

  function upload() {
    if (!file || !preview?.source || preview.needsAccount || inspecting || busy)
      return;
    setError("");
    startUpload(async () => {
      try {
        const result = await importStatementFile(
          formData(file, preview.source!, account),
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSummary(result.summary);
        router.refresh();
      } catch {
        setError("Importen kunne ikke fullføres. Prøv igjen med samme fil.");
      }
    });
  }

  function fetchVipps() {
    setError("");
    setFetched(null);
    startFetch(async () => {
      try {
        const result = await fetchFromVipps({
          from: from || undefined,
          to: to || undefined,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setFetched(result.accounts);
        router.refresh();
      } catch {
        setError("Fikk ikke hentet fra Vipps. Prøv igjen.");
      }
    });
  }

  function resetFile() {
    inspection.current++;
    setFile(null);
    setPreview(null);
    setSource("auto");
    setAccount("");
    setSummary(null);
    setError("");
  }

  const needsDetails = preview && (!preview.source || preview.needsAccount);
  const ready =
    !!preview?.source && !preview.needsAccount && preview.transactions > 0;

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          if (summary) resetFile();
          setMode("file");
          setOpen(true);
        }}
        className={cn(
          actionClass,
          "bg-admin-action text-white hover:bg-[#25652D]",
        )}
      >
        <Upload aria-hidden="true" className="size-4" />
        Importer
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent
          showCloseButton={!busy}
          closeLabel="Lukk importvindu"
          className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-xl"
        >
          <DialogHeader className="shrink-0 bg-[#FCFAF5] px-5 pt-6 pb-4 pr-12 sm:px-6">
            <DialogTitle className="font-heading text-2xl font-bold">
              Importer transaksjoner
            </DialogTitle>
          </DialogHeader>
          <nav
            aria-label="Importvalg"
            className="flex shrink-0 border-b border-[#E3DED3] bg-[#FCFAF5] px-5 sm:px-6"
          >
            {modes.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={mode === item.value}
                disabled={busy}
                onClick={() => {
                  setMode(item.value);
                  setError("");
                }}
                className={cn(
                  "min-h-11 flex-1 border-b-2 px-1 py-3 text-sm font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-admin-action focus-visible:ring-inset disabled:cursor-wait",
                  mode === item.value
                    ? "border-admin-action text-admin-action"
                    : "border-transparent text-admin-muted hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto p-5 sm:p-6">
            {mode === "file" && !summary && (
              <>
                <input
                  ref={input}
                  id="import-file"
                  type="file"
                  aria-label="Velg fil"
                  disabled={busy}
                  accept=".csv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => {
                    selectFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                  className="sr-only"
                  tabIndex={-1}
                />
                {!file ? (
                  <div
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (!busy) setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragging(false);
                      if (event.dataTransfer.files.length > 1) {
                        setError("Velg én fil om gangen.");
                        return;
                      }
                      selectFile(event.dataTransfer.files[0]);
                    }}
                    className={cn(
                      "grid justify-items-center gap-3 rounded-xl border border-dashed px-5 py-10 text-center transition-colors",
                      dragging
                        ? "border-admin-action bg-[#F2F8F2]"
                        : "border-[#C8C4B8] bg-[#FCFAF5]",
                    )}
                  >
                    <Upload
                      aria-hidden="true"
                      className="size-7 text-admin-action"
                    />
                    <p className="font-heading text-xl font-semibold">
                      Slipp en fil her
                    </p>
                    <Button
                      type="button"
                      onClick={() => input.current?.click()}
                      variant="outline"
                      className={cn(actionClass, "bg-white")}
                    >
                      Velg fil
                    </Button>
                    <p className="text-xs text-admin-muted">
                      CSV, TXT eller Excel · maks 4 MB
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 border-b border-[#ECE8DF] pb-4">
                      <FileSpreadsheet
                        aria-hidden="true"
                        className="size-6 shrink-0 text-admin-action"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold break-words">{file.name}</p>
                        <p className="text-xs text-admin-muted">
                          {Math.max(1, Math.round(file.size / 1024))} kB
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy || inspecting}
                        onClick={() => input.current?.click()}
                        className={actionClass}
                      >
                        Bytt fil
                      </Button>
                    </div>
                    {inspecting && (
                      <p
                        role="status"
                        className="flex items-center gap-2 text-admin-muted"
                      >
                        <Loader2
                          aria-hidden="true"
                          className="size-4 animate-spin motion-reduce:animate-none"
                        />
                        Leser filen …
                      </p>
                    )}
                    {!preview &&
                      !inspecting &&
                      error &&
                      file.size > 0 &&
                      file.size <= 4 * 1024 * 1024 && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => inspect(file, source, account)}
                          className={actionClass}
                        >
                          Prøv igjen
                        </Button>
                      )}
                    {needsDetails && (
                      <div className="grid gap-4">
                        {!preview.source && (
                          <div className="grid gap-1.5">
                            <Label htmlFor="import-source">Filen er fra</Label>
                            <SelectField
                              id="import-source"
                              value={source}
                              disabled={inspecting}
                              onValueChange={setSource}
                              options={[
                                {
                                  value: "auto",
                                  label: "Velg DNB eller Vipps",
                                },
                                { value: "dnb", label: "DNB" },
                                { value: "vipps", label: "Vipps" },
                              ]}
                            />
                          </div>
                        )}
                        {preview.needsAccount &&
                          (preview.source === "dnb" ? (
                            <div className="grid gap-1.5">
                              <Label htmlFor="import-account" required>
                                Kontonummer
                              </Label>
                              <Input
                                id="import-account"
                                value={account}
                                disabled={inspecting}
                                onChange={(event) =>
                                  setAccount(event.target.value)
                                }
                                inputMode="numeric"
                                placeholder="1234.56.78901"
                                className="h-11 rounded-xl"
                              />
                            </div>
                          ) : (
                            <div className="grid gap-1.5">
                              <Label htmlFor="import-msn" required>
                                Salgssted
                              </Label>
                              <SelectField
                                id="import-msn"
                                value={account}
                                disabled={inspecting}
                                onValueChange={setAccount}
                                options={[
                                  { value: "", label: "Velg salgssted" },
                                  ...vippsAccounts,
                                ]}
                              />
                            </div>
                          ))}
                        <Button
                          type="button"
                          variant="outline"
                          disabled={
                            inspecting ||
                            (preview.needsAccount
                              ? !account
                              : source === "auto")
                          }
                          onClick={() =>
                            inspect(file, preview.source ?? source, account)
                          }
                          className={actionClass}
                        >
                          Les filen
                        </Button>
                      </div>
                    )}
                    {ready && (
                      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
                        <dt className="text-admin-muted">Kilde</dt>
                        <dd className="text-right font-bold">
                          {preview.source === "dnb" ? "DNB" : "Vipps"} ·{" "}
                          {preview.accounts}{" "}
                          {preview.source === "dnb"
                            ? preview.accounts === 1
                              ? "konto"
                              : "kontoer"
                            : preview.accounts === 1
                              ? "salgssted"
                              : "salgssteder"}
                        </dd>
                        <dt className="text-admin-muted">Transaksjoner</dt>
                        <dd className="text-right font-bold tabular-nums">
                          {preview.transactions.toLocaleString("nb-NO")}
                        </dd>
                        <dt className="text-admin-muted">Periode</dt>
                        <dd className="text-right">
                          {formatOsloDate(preview.from!)} -{" "}
                          {formatOsloDate(preview.to!)}
                        </dd>
                      </dl>
                    )}
                    {preview && preview.errors.length > 0 && (
                      <details className="rounded-xl bg-[#FFF8E9] px-4 py-3 text-sm text-[#6B5524]">
                        <summary className="cursor-pointer font-bold">
                          Rader som ikke kan importeres ({preview.errors.length}
                          )
                        </summary>
                        <ul className="mt-3 grid gap-1">
                          {preview.errors.map((line, index) => (
                            <li key={index}>{line}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </>
            )}
            {mode === "file" && summary && (
              <div role="status" className="grid gap-4">
                <div className="flex items-center gap-2 text-admin-action">
                  <CheckCheck aria-hidden="true" className="size-6" />
                  <h2 className="font-heading text-xl font-bold">
                    Importen er fullført
                  </h2>
                </div>
                <p className="font-bold break-words">{file?.name}</p>
                <dl className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-3 text-sm tabular-nums">
                  <dt>Nye transaksjoner</dt>
                  <dd className="font-bold">{summary.inserted}</dd>
                  <dt>Fantes fra før</dt>
                  <dd>{summary.duplicates}</dd>
                  {summary.matched > 0 && (
                    <>
                      <dt>Koblet til betalinger</dt>
                      <dd>{summary.matched}</dd>
                    </>
                  )}
                </dl>
                {summary.errors.length > 0 && (
                  <details className="rounded-xl bg-[#FFF8E9] px-4 py-3 text-sm text-[#6B5524]">
                    <summary className="cursor-pointer font-bold">
                      Rader som ikke ble importert ({summary.errors.length})
                    </summary>
                    <ul className="mt-3 grid gap-1">
                      {summary.errors.map((line, index) => (
                        <li key={index}>{line}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
            {mode === "vipps" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="vipps-from">Fra</Label>
                    <Input
                      id="vipps-from"
                      type="date"
                      value={from}
                      onChange={(event) => setFrom(event.target.value)}
                      disabled={fetching}
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="vipps-to">Til</Label>
                    <Input
                      id="vipps-to"
                      type="date"
                      value={to}
                      onChange={(event) => setTo(event.target.value)}
                      disabled={fetching}
                      className="h-11 rounded-xl"
                    />
                  </div>
                </div>
                {fetched && (
                  <ul role="status" className="grid gap-3 text-sm">
                    {fetched.map((row) => (
                      <li
                        key={row.msn}
                        className="grid gap-1 border-b border-[#ECE8DF] pb-3 last:border-0 last:pb-0"
                      >
                        <span className="font-bold">
                          {vippsAccounts.find(
                            (entry) => entry.value === row.msn,
                          )?.label ?? `Vipps ${row.msn}`}
                        </span>
                        {row.error ? (
                          <span className="text-[#9C3425]">{row.error}</span>
                        ) : (
                          <span>
                            {row.inserted} nye · {row.duplicates} fantes fra før
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {mode === "history" && history}
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-[#FFF1EC] px-4 py-3 text-sm text-[#9C3425]"
              >
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="mx-0 mb-0 shrink-0 border-t border-[#ECE8DF] bg-[#FCFAF5] px-5 py-4 sm:px-6">
            {summary && mode === "file" ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={resetFile}
                  className={actionClass}
                >
                  Importer en fil til
                </Button>
                <Button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={cn(
                    actionClass,
                    "bg-admin-action text-white hover:bg-[#25652D]",
                  )}
                >
                  Ferdig
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setOpen(false)}
                className={actionClass}
              >
                Lukk
              </Button>
            )}
            {mode === "file" && !summary && (
              <Button
                type="button"
                disabled={!ready || busy || inspecting}
                onClick={upload}
                className={cn(
                  actionClass,
                  "bg-admin-action text-white hover:bg-[#25652D]",
                )}
              >
                {uploading && (
                  <Loader2
                    aria-hidden="true"
                    className="size-4 animate-spin motion-reduce:animate-none"
                  />
                )}
                {uploading
                  ? "Importerer …"
                  : ready
                    ? `Importer ${preview.transactions.toLocaleString("nb-NO")} ${preview.transactions === 1 ? "transaksjon" : "transaksjoner"}`
                    : "Importer fil"}
              </Button>
            )}
            {mode === "vipps" && (
              <Button
                type="button"
                disabled={fetching}
                onClick={fetchVipps}
                className={cn(
                  actionClass,
                  "bg-admin-action text-white hover:bg-[#25652D]",
                )}
              >
                {fetching ? (
                  <Loader2
                    aria-hidden="true"
                    className="size-4 animate-spin motion-reduce:animate-none"
                  />
                ) : (
                  <CloudDownload aria-hidden="true" className="size-4" />
                )}
                {fetching ? "Henter …" : "Hent transaksjoner"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
