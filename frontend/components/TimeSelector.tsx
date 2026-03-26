"use client";

import { SelectNative } from "@/components/ui";

const TIMES = Array.from({ length: 24 * 12 }, (_, i) => {
  const totalMinutes = i * 5;
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const mm = String(totalMinutes % 60).padStart(2, "0");
  return `${hh}:${mm}:00`;
});

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export default function TimeSelector({ value, onChange, className }: Props) {
  return (
    <SelectNative
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      {TIMES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </SelectNative>
  );
}
