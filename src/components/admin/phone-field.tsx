"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function splitPhone(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  const compact = raw.replace(/[\s-]/g, "");
  if (!compact) return { code: "+47", number: "" };
  const norwegian = compact.match(/^(?:\+47|0047)(\d{8})$/);
  if (norwegian) return { code: "+47", number: norwegian[1] };
  if (/^\d{8}$/.test(compact)) return { code: "+47", number: compact };
  const spaced = raw.match(/^(\+\d{1,4})\s+(.+)$/);
  if (spaced) return { code: spaced[1], number: spaced[2] };
  return { code: "", number: raw };
}

export function PhoneField({
  id,
  name,
  defaultValue,
  className,
}: {
  id: string;
  name: string;
  defaultValue?: string | null;
  className?: string;
}) {
  const initial = splitPhone(defaultValue);
  const [code, setCode] = useState(initial.code);
  const [number, setNumber] = useState(initial.number);
  const trimmedNumber = number.trim();
  const value = !trimmedNumber
    ? ""
    : trimmedNumber.startsWith("+") || !code.trim()
      ? trimmedNumber
      : `${code.trim()} ${trimmedNumber}`;

  return (
    <div className="flex gap-2">
      <Input
        aria-label="Landskode"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        inputMode="tel"
        autoComplete="off"
        className={cn("w-16 shrink-0", className)}
      />
      <Input
        id={id}
        type="tel"
        value={number}
        onChange={(event) => setNumber(event.target.value)}
        autoComplete="off"
        className={cn("min-w-0 flex-1", className)}
      />
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
