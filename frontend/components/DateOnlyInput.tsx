"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  placeholder?: string;
  id?: string;
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
  const controlled = value !== undefined;
  const displayValue = controlled ? value : internal;

  useEffect(() => {
    if (controlled) {
      setInternal(value ?? "");
    }
  }, [controlled, value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!controlled) setInternal(v);
    onChange?.(v);
  };

  return (
    <div className={cn("relative", className)}>
      {/* Overlay showing yyyy-mm-dd */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center px-3 text-sm font-mono"
        aria-hidden
      >
        {displayValue || (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
      </div>
      <input
        id={id}
        lang="en-CA"
        type="date"
        value={displayValue}
        onChange={handleChange}
        style={{ color: "transparent", caretColor: "transparent" }}
        className="flex h-9 w-full rounded-md border border-border bg-input px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      {name && <input type="hidden" name={name} value={displayValue} />}
    </div>
  );
}
