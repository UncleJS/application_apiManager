"use client";

import { useCallback, useEffect, useState } from "react";
import { archiveWindow, createWindow, getWindows, unarchiveWindow, type Window as ApiWindow } from "@/lib/api";
import TimeSelector from "@/components/TimeSelector";
import { Button, SelectNative, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import { Trash2 } from "lucide-react";

const DAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
];

interface Props {
  subjectType: "user" | "api";
  subjectId: number;
}

export default function WindowsEditor({ subjectType, subjectId }: Props) {
  const [items, setItems] = useState<ApiWindow[]>([]);
  const [day, setDay] = useState(1);
  const [start, setStart] = useState("08:00:00");
  const [end, setEnd] = useState("17:00:00");
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getWindows(subjectType, subjectId);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load windows");
    } finally {
      setLoading(false);
    }
  }, [subjectId, subjectType]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    setAdding(true);
    setError("");
    try {
      await createWindow({ subjectType, subjectId, dayOfWeek: day, startTime: start, endTime: end });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add window");
    } finally {
      setAdding(false);
    }
  };

  const handleUnarchive = async (id: number) => {
    setError("");
    try {
      await unarchiveWindow(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unarchive window");
    }
  };

  const handleArchive = async (id: number) => {
    setError("");
    try {
      await archiveWindow(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive window");
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Access Windows</h3>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-foreground/70">Day</label>
          <SelectNative
            value={day}
            onChange={(e) => setDay(Number(e.target.value))}
            className="w-32"
          >
            {DAY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </SelectNative>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-foreground/70">Start</label>
          <TimeSelector value={start} onChange={setStart} className="w-24" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-foreground/70">End</label>
          <TimeSelector value={end} onChange={setEnd} className="w-24" />
        </div>
        <Button onClick={handleAdd} disabled={adding} size="sm">
          Add window
        </Button>
      </div>

      {loading && <p className="text-sm text-foreground/70">Loading windows…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && items.length === 0 ? (
        <p className="text-sm text-foreground/70">No windows configured.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Day</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((w) => (
              <TableRow key={w.id}>
                <TableCell>{DAY_OPTIONS.find((d) => d.value === w.day_of_week)?.label}</TableCell>
                <TableCell className="font-mono">{w.start_time}</TableCell>
                <TableCell className="font-mono">{w.end_time}</TableCell>
                <TableCell>
                  <span className={w.is_active ? "text-primary text-xs" : "text-foreground/70 text-xs"}>
                    {w.is_active ? "Active" : "Archived"}
                  </span>
                </TableCell>
                <TableCell>
                  {w.is_active ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleArchive(w.id)}
                      className="h-7 w-7 text-foreground/70 hover:text-destructive"
                      aria-label={`Archive window for ${DAY_OPTIONS.find((d) => d.value === w.day_of_week)?.label ?? "day"}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => handleUnarchive(w.id)}>
                      Unarchive
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
