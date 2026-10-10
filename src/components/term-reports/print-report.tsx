"use client";

import { Button } from "@/components/ui/button";

export function PrintReport({ locale }: { locale: string }) {
  return <Button className="print:hidden" variant="outline" onClick={() => window.print()}>{locale === "en" ? "Print report" : "Skriv ut rapport"}</Button>;
}
