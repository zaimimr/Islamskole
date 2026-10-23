"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { saveSfoActivity } from "@/lib/sfo/actions";
import { changeActivity } from "@/lib/school-activities/actions";
import type { Database } from "@/lib/supabase/types";

type Activity = Database["public"]["Tables"]["school_activities"]["Row"];
type ClassOption = { id: string; name: string };

const serverErrors: Record<string, string> = {
  "22023": "Sjekk datoene. Svarfrist må være før aktiviteten, og ingen av dem kan være passert.",
  "23514": "Publisert aktivitet: pris, samtykke, alder og klasser kan ikke endres.",
  PT409: "Aktiviteten er endret av noen andre. Last siden på nytt.",
};

function toOre(value: FormDataEntryValue | null) {
  const text = String(value ?? "").replace(",", ".").trim();
  return text ? Math.round(Number(text) * 100) : null;
}

function toInt(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? Number.parseInt(text, 10) : null;
}

type Errors = Partial<Record<"title" | "date" | "respondBy" | "end" | "capacity" | "minAge" | "maxAge" | "price" | "paymentDue" | "consent", string>>;

function osloToday() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date());
}

function validate(data: FormData, needsConsent: boolean, locked: boolean, published: boolean, signup: boolean): Errors {
  const value = (name: string) => String(data.get(name) ?? "").trim();
  const result: Errors = {};
  const today = osloToday();
  const date = value("date");
  const respondBy = value("respondBy");
  if (!value("title")) result.title = "Skriv en tittel";
  if (!date) result.date = "Velg dato";
  else if (date < today) result.date = "Datoen er passert";
  if (!signup) {
    if (value("start") && value("end") && value("end") <= value("start")) result.end = "Må være etter starttid";
    return result;
  }
  if (!respondBy) result.respondBy = "Velg svarfrist";
  else if (!published && respondBy < today) result.respondBy = "Svarfristen er passert";
  else if (date && respondBy > date) result.respondBy = "Må være før eller på datoen";
  if (value("start") && value("end") && value("end") <= value("start")) result.end = "Må være etter starttid";
  const capacity = value("capacity");
  if (capacity && !(Number.isInteger(Number(capacity)) && Number(capacity) >= 1)) result.capacity = "Minst 1";
  if (!locked) {
    const minAge = value("minAge");
    const maxAge = value("maxAge");
    if (minAge && !(Number.isInteger(Number(minAge)) && Number(minAge) >= 0 && Number(minAge) <= 30)) result.minAge = "0 til 30";
    if (maxAge && !(Number.isInteger(Number(maxAge)) && Number(maxAge) >= 0 && Number(maxAge) <= 30)) result.maxAge = "0 til 30";
    else if (minAge && maxAge && Number(maxAge) < Number(minAge)) result.maxAge = "Må være minst fra alder";
    const price = value("price");
    if (price && !(/^[0-9]+([.,][0-9]{1,2})?$/.test(price) && Number(price.replace(",", ".")) > 0)) result.price = "Skriv et beløp, for eksempel 150";
    if (value("paymentDue") && !price) result.paymentDue = "Sett pris først";
    if (needsConsent && !value("consent")) result.consent = "Skriv samtykketekst";
  }
  if (value("paymentDue") && date && value("paymentDue") > date) result.paymentDue = "Må være før eller på datoen";
  return result;
}

const field = "grid gap-2";
const check = "flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold";

export function SfoActivityForm({ initial, audience, classes, basePath }: { initial?: Activity; audience: string[]; classes: ClassOption[]; basePath: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const draftId = useRef(initial?.id ?? crypto.randomUUID());
  const [needsConsent, setNeedsConsent] = useState(initial?.needs_consent ?? true);
  const [signup, setSignup] = useState(initial?.signup ?? true);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [attempted, setAttempted] = useState(false);
  const [notify, setNotify] = useState(true);
  const [pending, start] = useTransition();
  const locked = initial != null && initial.status !== "draft";
  const closed = initial?.status === "cancelled";

  const published = initial?.status === "published";

  function revalidate() {
    if (!form.current) return {};
    const next = validate(new FormData(form.current), needsConsent, locked, published, signup);
    setErrors(next);
    return next;
  }

  function invalid(name: keyof Errors) {
    return errors[name] ? { "aria-invalid": true, "aria-describedby": `sfo-${name}-error` } : {};
  }

  function error(name: keyof Errors) {
    return errors[name] ? <p id={`sfo-${name}-error`} className="text-sm font-semibold text-destructive">{errors[name]}</p> : null;
  }

  function save(publish: boolean) {
    if (!form.current) return;
    setAttempted(true);
    const found = revalidate();
    const first = Object.keys(found)[0];
    if (first) { setMessage("Rett feltene som er markert."); form.current.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(); return; }
    const data = new FormData(form.current);
    start(async () => {
      setMessage("");
      const result = await saveSfoActivity({
        id: draftId.current, expected: initial?.updated_at ?? null, title: String(data.get("title")), description: String(data.get("description") ?? ""),
        needsConsent: signup && needsConsent, consent: locked ? initial.consent_text : signup && needsConsent ? String(data.get("consent") ?? "") : "",
        date: String(data.get("date")), respondBy: String(data.get(signup ? "respondBy" : "date")),
        location: String(data.get("location") ?? "") || null, start: String(data.get("start") ?? "") || null, end: String(data.get("end") ?? "") || null,
        capacity: signup ? toInt(data.get("capacity")) : null, minAge: locked ? initial.min_age : toInt(data.get("minAge")), maxAge: locked ? initial.max_age : toInt(data.get("maxAge")),
        priceOre: locked ? initial.price_ore : signup ? toOre(data.get("price")) : null,
        paymentDue: signup ? String(data.get("paymentDue") ?? "") || null : null, signup, showOnWebsite: data.get("showOnWebsite") === "on",
        audience: locked ? audience : data.getAll("audience").map(String),
      });
      if (!result.ok) { setMessage(serverErrors[result.code ?? ""] ?? "Kunne ikke lagre."); return; }
      if (publish && result.activity) {
        const outcome = await changeActivity({ id: result.activity.id, expected: result.activity.updated_at, action: "publish", notify });
        if (!outcome.ok) { setMessage(outcome.code === "22023" ? "Lagret, men kunne ikke publisere. Sjekk datoene, og at minst ett barn passer klasser og alder." : "Lagret, men kunne ikke publisere."); if (!initial) router.push(`${basePath}/sfo/${result.activity.id}`); return; }
      }
      if (!initial) { router.push(`${basePath}/sfo/${draftId.current}`); return; }
      setMessage(publish ? "Publisert" : "Lagret");
      router.refresh();
    });
  }

  return <form ref={form} noValidate className="grid gap-5 rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3] sm:p-6" onChange={() => { if (attempted && !Object.keys(revalidate()).length) setMessage(""); }} onSubmit={(event) => { event.preventDefault(); save(false); }}>
    <fieldset disabled={pending || closed} className="grid gap-5">
      <div className={field}><Label htmlFor="sfo-title" required>Tittel</Label><Input id="sfo-title" name="title" defaultValue={initial?.title} required maxLength={200} {...invalid("title")} />{error("title")}</div>
      <div className={field}><Label htmlFor="sfo-description">Beskrivelse</Label><Textarea id="sfo-description" name="description" defaultValue={initial?.description} maxLength={4000} /></div>
      <label className={check}><input type="checkbox" checked={signup} onChange={(event) => setSignup(event.target.checked)} disabled={locked} className="size-4 accent-[#3C8F44]" />Krever påmelding</label>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={field}><Label htmlFor="sfo-date" required>Dato</Label><Input id="sfo-date" name="date" type="date" defaultValue={initial?.event_date} required {...invalid("date")} />{error("date")}</div>
        <div className={field}><Label htmlFor="sfo-start">Fra</Label><Input id="sfo-start" name="start" type="time" defaultValue={initial?.start_time?.slice(0, 5) ?? ""} /></div>
        <div className={field}><Label htmlFor="sfo-end">Til</Label><Input id="sfo-end" name="end" type="time" defaultValue={initial?.end_time?.slice(0, 5) ?? ""} {...invalid("end")} />{error("end")}</div>
        {signup ? <div className={field}><Label htmlFor="sfo-respond" required>Svarfrist</Label><Input id="sfo-respond" name="respondBy" type="date" defaultValue={initial?.respond_by} required {...invalid("respondBy")} />{error("respondBy")}</div> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`${field} lg:col-span-2`}><Label htmlFor="sfo-location">Sted</Label><Input id="sfo-location" name="location" defaultValue={initial?.location ?? ""} maxLength={200} /></div>
        {signup ? <div className={field}><Label htmlFor="sfo-capacity">Maks plasser</Label><Input id="sfo-capacity" name="capacity" type="number" min={1} defaultValue={initial?.capacity ?? ""} {...invalid("capacity")} />{error("capacity")}</div> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={field}><Label htmlFor="sfo-min-age">Fra alder</Label><Input id="sfo-min-age" name="minAge" type="number" min={0} max={30} defaultValue={initial?.min_age ?? ""} disabled={locked} {...invalid("minAge")} />{error("minAge")}</div>
        <div className={field}><Label htmlFor="sfo-max-age">Til alder</Label><Input id="sfo-max-age" name="maxAge" type="number" min={0} max={30} defaultValue={initial?.max_age ?? ""} disabled={locked} {...invalid("maxAge")} />{error("maxAge")}</div>
        {signup ? <><div className={field}><Label htmlFor="sfo-price">Pris (kr)</Label><Input id="sfo-price" name="price" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" defaultValue={initial?.price_ore != null ? String(initial.price_ore / 100) : ""} disabled={locked} {...invalid("price")} />{error("price")}</div>
        <div className={field}><Label htmlFor="sfo-due">Betalingsfrist</Label><Input id="sfo-due" name="paymentDue" type="date" defaultValue={initial?.payment_due ?? ""} {...invalid("paymentDue")} />{error("paymentDue")}</div></> : null}
      </div>
      <fieldset className="grid gap-2" disabled={locked}>
        <legend className="mb-2 text-sm font-semibold">Klasser <span className="font-normal text-admin-muted">(ingen valgt = alle)</span></legend>
        <div className="flex flex-wrap gap-x-6">{classes.map((item) => <label key={item.id} className={check}>
          <input type="checkbox" name="audience" value={item.id} defaultChecked={audience.includes(item.id)} className="size-4 accent-[#3C8F44]" />{item.name}</label>)}</div>
      </fieldset>
      {signup ? <label className={check}><input type="checkbox" checked={needsConsent} onChange={(event) => setNeedsConsent(event.target.checked)} disabled={locked} className="size-4 accent-[#3C8F44]" />Krever samtykke</label> : null}
      {signup && needsConsent ? <div className={field}><Label htmlFor="sfo-consent" required>Samtykketekst</Label><Textarea id="sfo-consent" name="consent" defaultValue={initial?.consent_text} required maxLength={4000} disabled={locked} {...invalid("consent")} />{error("consent")}</div> : null}
      <label className={check}><input type="checkbox" name="showOnWebsite" defaultChecked={initial?.show_on_website ?? false} className="size-4 accent-[#3C8F44]" />Vis på nettsiden</label>
      {!locked ? <label className={check}><input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} className="size-4 accent-[#3C8F44]" />Send e-post til foresatte ved publisering</label> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="outline" className="min-h-11 rounded-xl">{locked ? "Lagre endringer" : "Lagre utkast"}</Button>
        {!locked ? <Button type="button" className="min-h-11 rounded-xl bg-admin-action font-bold text-white hover:bg-[#245E2B]" onClick={() => save(true)}>Publiser</Button> : null}
      </div>
    </fieldset>
    {message ? <p role="status" className="text-sm font-semibold">{message}</p> : null}
  </form>;
}
