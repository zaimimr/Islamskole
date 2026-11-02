"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CapacityIncrease({ id, className, capacity, enrolled, value, onChange }: {
  id: string;
  className: string;
  capacity: number;
  enrolled: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const nextCapacity = value || String(enrolled + 1);
  return <div className="grid gap-2 rounded-xl border border-[#D5B86B] bg-[#FFF8E7] p-3">
    <p className="text-sm font-bold">{className}: {enrolled}/{capacity} plasser</p>
    <Label htmlFor={id}>Ny kapasitet for klassen</Label>
    <Input id={id} name="new_capacity" type="number" inputMode="numeric" min={Math.max(capacity + 1, enrolled + 1)} max={10000} required value={nextCapacity} onChange={(event) => onChange(event.target.value)} />
    <input type="hidden" name="expected_capacity" value={capacity} />
    <p className="text-sm text-[#6B4A06]">Kapasitet {capacity} til {nextCapacity}. Eleven plasseres samtidig.</p>
  </div>;
}
