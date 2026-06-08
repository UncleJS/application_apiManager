"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  placeholder?: string;
  id?: string;
}

export function sanitizeDateOnlyInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function isCompleteDateOnlyValue(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default function DateOnlyInput({
  name,
  value,
  onChange,
  className,
  placeholder = "yyyy-mm-dd",
  id,
}: Props) {
  const [internal, setInternal] = useState(value ?? "");
  const pickerRef = useRef<HTMLInputElement>(null);
  const controlled = value !== undefined;
  const displayValue = controlled ? value : internal;
  const pickerValue = isCompleteDateOnlyValue(displayValue) ? displayValue : "";

  useEffect(() => {
    if (controlled) {
      setInternal(value ?? "");
    }
  }, [controlled, value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = sanitizeDateOnlyInput(e.target.value);
    if (!controlled) setInternal(v);
    onChange?.(v);
  };

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!controlled) setInternal(v);
    onChange?.(v);
  };

  const openPicker = () => {
    const picker = pickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!picker) return;

    if (typeof picker.showPicker === "function") {
      picker.showPicker();
      return;
    }

    picker.focus();
    picker.click();
  };

  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        pattern="\d{4}-\d{2}-\d{2}"
        maxLength={10}
        value={displayValue}
        onChange={handleChange}
        className={cn(
          "flex h-9 w-full rounded-md border border-border bg-input px-3 py-1 pr-10 font-mono text-sm",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "placeholder:text-foreground/70",
        )}
      />
      <button
        type="button"
        onClick={openPicker}
        aria-label="Open date picker"
        className="absolute right-0 top-0 inline-flex h-9 w-9 items-center justify-center text-foreground/70 transition-colors hover:text-foreground"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
      <input
        ref={pickerRef}
        tabIndex={-1}
        aria-hidden="true"
        type="date"
        value={pickerValue}
        onChange={handlePickerChange}
        className="absolute right-2 top-2 h-5 w-5 opacity-0"
      />
    </div>
  );
}
