import Link from "next/link";
import { ChevronDown, ClipboardCheck, NotebookPen } from "lucide-react";
import { formatOsloDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type DayOverview = {
  id: string;
  date: string;
  present: string[];
  absent: string[];
  reported: { name: string; reason: string | null; source: "app" | "laerer" }[];
  late: string[];
  unmarked: string[];
  markedBy: string[];
  note: { homework: string | null; summary: string | null; author: string | null } | null;
};

const groupTone = {
  present: "bg-[#E8F3E6] text-[#1F6B2A]",
  absent: "bg-[#FBE7E4] text-[#9B2C1F]",
  reported: "bg-[#FBEFD9] text-[#8A5A00]",
  late: "bg-[#FBF3D6] text-[#7A5A00]",
  unmarked: "bg-[#F1EFEA] text-admin-muted",
};

function Chip({ tone, children }: { tone: keyof typeof groupTone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums", groupTone[tone])}>
      {children}
    </span>
  );
}

function NameGroup({
  title,
  tone,
  names,
}: {
  title: string;
  tone: keyof typeof groupTone;
  names: React.ReactNode[];
}) {
  if (!names.length) return null;
  return (
    <div className="grid content-start gap-2">
      <p className="flex items-center gap-2 text-sm font-bold">
        <Chip tone={tone}>{names.length}</Chip>
        {title}
      </p>
      <ul className="grid gap-1 text-sm">{names}</ul>
    </div>
  );
}

function reportedName(row: DayOverview["reported"][number]) {
  return (
    <li key={row.name}>
      {row.name}
      {row.reason ? <span className="block text-admin-muted">{row.reason}</span> : null}
    </li>
  );
}

export function ClassDayOverview({
  days,
  studentCount,
  portalHref,
}: {
  days: DayOverview[];
  studentCount: number;
  portalHref: string;
}) {
  const held = days.filter((day) => day.unmarked.length < studentCount);
  const withNote = days.filter((day) => day.note).length;
  const absences = days.reduce((sum, day) => sum + day.absent.length + day.reported.length, 0);
  const unreported = days.reduce((sum, day) => sum + day.absent.length, 0);

  return (
    <section className="grid gap-3 print:hidden" aria-labelledby="day-overview-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="day-overview-title" className="font-heading text-xl font-bold">
            Oppmøte og notater per skoledag
          </h2>
          <p className="text-sm text-admin-muted">
            {held.length} av {days.length} skoledager ført · {withNote} med notat · {absences} fravær totalt{unreported ? `, ${unreported} ugyldig` : ""}
          </p>
        </div>
      </div>
      <ul className="grid gap-2">
        {days.map((day) => {
          const marked = day.unmarked.length < studentCount;
          const viaApp = day.reported.filter((row) => row.source === "app");
          const viaTeacher = day.reported.filter((row) => row.source === "laerer");
          return (
            <li key={day.id}>
              <details className="group overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
                <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 outline-none hover:bg-[#FBFAF6] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span className="w-28 shrink-0 font-bold tabular-nums">
                    {formatOsloDate(day.date, { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    {marked ? (
                      <>
                        <Chip tone="present">{day.present.length} møtt</Chip>
                        {viaApp.length ? <Chip tone="reported">{viaApp.length} meldt i appen</Chip> : null}
                        {viaTeacher.length ? <Chip tone="reported">{viaTeacher.length} meldt til lærer</Chip> : null}
                        {day.absent.length ? <Chip tone="absent">{day.absent.length} ugyldig fravær</Chip> : null}
                        {day.late.length ? <Chip tone="late">{day.late.length} forsinket</Chip> : null}
                        {day.unmarked.length ? <Chip tone="unmarked">{day.unmarked.length} ikke ført</Chip> : null}
                      </>
                    ) : (
                      <Chip tone="unmarked">Ikke ført</Chip>
                    )}
                    {day.note ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-[#277A31]">
                        <NotebookPen aria-hidden="true" className="size-3.5" />
                        Notat
                      </span>
                    ) : null}
                  </span>
                  {day.markedBy.length ? (
                    <span className="hidden text-sm text-admin-muted lg:inline">Ført av {day.markedBy.join(", ")}</span>
                  ) : null}
                  <ChevronDown
                    aria-hidden="true"
                    className="size-5 shrink-0 text-admin-muted transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="grid gap-5 border-t border-[#ECE8DF] px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] content-start gap-4">
                    <NameGroup
                      title="Ugyldig fravær"
                      tone="absent"
                      names={day.absent.map((name) => <li key={name}>{name}</li>)}
                    />
                    <NameGroup title="Meldt i appen" tone="reported" names={viaApp.map(reportedName)} />
                    <NameGroup title="Meldt til lærer" tone="reported" names={viaTeacher.map(reportedName)} />
                    <NameGroup title="Forsinket" tone="late" names={day.late.map((name) => <li key={name}>{name}</li>)} />
                    <NameGroup
                      title="Møtt"
                      tone="present"
                      names={day.present.map((name) => <li key={name}>{name}</li>)}
                    />
                    <NameGroup
                      title="Ikke ført"
                      tone="unmarked"
                      names={day.unmarked.map((name) => <li key={name}>{name}</li>)}
                    />
                  </div>
                  <div className="grid content-start gap-3 rounded-xl bg-[#FBFAF6] p-4 ring-1 ring-[#ECE8DF]">
                    <p className="flex items-center gap-2 text-sm font-bold">
                      <NotebookPen aria-hidden="true" className="size-4 text-[#277A31]" />
                      Ukens notat
                      {day.note?.author ? (
                        <span className="font-normal text-admin-muted">av {day.note.author}</span>
                      ) : null}
                    </p>
                    {day.note ? (
                      <dl className="grid gap-3 text-sm">
                        {day.note.homework ? (
                          <div>
                            <dt className="font-bold">Lekser</dt>
                            <dd className="whitespace-pre-line">{day.note.homework}</dd>
                          </div>
                        ) : null}
                        {day.note.summary ? (
                          <div>
                            <dt className="font-bold">Hva vi gjorde</dt>
                            <dd className="whitespace-pre-line">{day.note.summary}</dd>
                          </div>
                        ) : null}
                      </dl>
                    ) : (
                      <p className="text-sm text-admin-muted">Ingen notat for denne dagen.</p>
                    )}
                    {day.markedBy.length ? (
                      <p className="text-sm text-admin-muted">Oppmøte ført av {day.markedBy.join(", ")}</p>
                    ) : null}
                    <Link
                      href={`${portalHref}?dag=${day.id}`}
                      className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-[#DCD7CC] bg-white px-3 text-sm font-bold text-[#277A31] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <ClipboardCheck aria-hidden="true" className="size-4" />
                      Endre oppmøte eller notat
                    </Link>
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
