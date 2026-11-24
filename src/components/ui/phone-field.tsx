"use client";

import { useState, type ComponentProps } from "react";
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

type PhoneFieldProps = Omit<ComponentProps<"input">, "name" | "defaultValue" | "value" | "onChange" | "type"> & {
  name: string;
  defaultValue?: string | null;
};

export function PhoneField({ name, defaultValue, className, disabled, ...props }: PhoneFieldProps) {
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
        disabled={disabled}
        className={cn(className, "w-16 shrink-0")}
      />
      <Input
        autoComplete="off"
        {...props}
        type="tel"
        inputMode="tel"
        value={number}
        onChange={(event) => setNumber(event.target.value)}
        disabled={disabled}
        className={cn(className, "min-w-0 flex-1")}
      />
      <input type="hidden" name={name} value={value} disabled={disabled} />
    </div>
  );
}
