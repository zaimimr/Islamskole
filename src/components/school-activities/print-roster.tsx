"use client";

import { Button } from "@/components/ui/button";

export function PrintRoster({ locale }: { locale: string }) {
  return <Button className="print:hidden w-fit" variant="outline" onClick={() => window.print()}>{locale === "en" ? "Print roster" : "Skriv ut deltakerliste"}</Button>;
}
