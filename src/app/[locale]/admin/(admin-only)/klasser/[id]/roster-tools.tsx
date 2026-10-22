"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export type RosterCsvRow = {
  name: string;
  age: string;
  guardian: string;
  phone: string;
  email: string;
  payment: string;
};

function cell(value: string) {
  const risky = /^[=+\-@\t\r]/.test(value) && !/^\+?[\d\s]+$/.test(value);
  const safe = risky ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function RosterTools({
  rows,
  fileName,
}: {
  rows: RosterCsvRow[];
  fileName: string;
}) {
  function downloadCsv() {
    const header = ["Navn", "Alder", "Foresatt", "Telefon", "E-post", "Betaling"];
    const lines = [
      header.map(cell).join(";"),
      ...rows.map((row) =>
        [row.name, row.age, row.guardian, row.phone, row.email, row.payment]
          .map(cell)
          .join(";"),
      ),
    ];
    const blob = new Blob([`﻿${lines.join("\r\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button
        type="button"
        variant="outline"
        onClick={() => window.print()}
        className="min-h-11 rounded-xl bg-white px-3 font-bold"
      >
        <Printer aria-hidden="true" className="size-4" />
        Skriv ut
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={downloadCsv}
        disabled={rows.length === 0}
        className="min-h-11 rounded-xl bg-white px-3 font-bold"
      >
        <Download aria-hidden="true" className="size-4" />
        Last ned CSV
      </Button>
    </div>
  );
}
