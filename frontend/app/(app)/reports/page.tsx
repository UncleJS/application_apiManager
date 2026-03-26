"use client";

import { useState } from "react";
import {
  getOrgMonthlyReport, getOrgWeeklyReport,
  getUserMonthlyReport, getUserWeeklyReport,
  type ReportResult, type ReportRow,
} from "@/lib/api";
import {
  Button, Card, CardContent, CardHeader, CardTitle, Label, Tabs,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui";
import DateOnlyInput from "@/components/DateOnlyInput";
import { RefreshCw } from "lucide-react";
import ErrorBanner from "@/components/ErrorBanner";
import { getErrorMessage } from "@/lib/page-utils";

const TABS = [
  { id: "orgs-weekly", label: "Orgs Weekly" },
  { id: "orgs-monthly", label: "Orgs Monthly" },
  { id: "users-weekly", label: "Users Weekly" },
  { id: "users-monthly", label: "Users Monthly" },
];

const EMPTY: ReportResult = {
  range: { start: "", end: "" },
  items: [],
  totals: {
    allowed_count: 0, denied_count: 0, total_count: 0,
    request_bytes_total: 0, response_bytes_total: 0,
    response_header_bytes_total: 0, total_bytes_total: 0,
  },
};

function fmt(n: number | undefined): string {
  if (n === undefined || n === null) return "0";
  return n.toLocaleString();
}

function fmtBytes(n: number | undefined): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

function ReportTable({ report, nameKey }: { report: ReportResult; nameKey: "organization_name" | "username" }) {
  const labelKey = nameKey === "organization_name" ? "week_label" : "week_label";
  return (
    <div className="space-y-2">
      {report.range.start && (
        <p className="text-xs text-muted-foreground">
          {report.range.start} → {report.range.end}
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{nameKey === "organization_name" ? "Organisation" : "User"}</TableHead>
            <TableHead>Period</TableHead>
            <TableHead className="text-right">Allowed</TableHead>
            <TableHead className="text-right">Denied</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Bytes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No data.</TableCell>
            </TableRow>
          )}
          {report.items.map((row, i) => (
            <TableRow key={i}>
              <TableCell>{(row as Record<string, unknown>)[nameKey] as string ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{row.week_label ?? row.month_label ?? "—"}</TableCell>
              <TableCell className="text-right text-primary font-mono">{fmt(row.allowed_count)}</TableCell>
              <TableCell className="text-right text-red-400 font-mono">{fmt(row.denied_count)}</TableCell>
              <TableCell className="text-right font-mono">{fmt(row.total_count)}</TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">{fmtBytes(row.total_bytes_total)}</TableCell>
            </TableRow>
          ))}
          {/* Totals row */}
          {report.items.length > 0 && (
            <TableRow className="border-t-2 border-border bg-muted/30 font-semibold">
              <TableCell colSpan={2} className="text-muted-foreground">Totals</TableCell>
              <TableCell className="text-right text-primary font-mono">{fmt(report.totals.allowed_count)}</TableCell>
              <TableCell className="text-right text-red-400 font-mono">{fmt(report.totals.denied_count)}</TableCell>
              <TableCell className="text-right font-mono">{fmt(report.totals.total_count)}</TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">{fmtBytes(report.totals.total_bytes_total)}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("orgs-weekly");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportResult>(EMPTY);
  const [error, setError] = useState("");

  const nameKey = activeTab.startsWith("orgs") ? "organization_name" : "username";

  const load = async (tab = activeTab) => {
    setLoading(true);
    setReport(EMPTY);
    setError("");
    const range = from || to ? { from: from || undefined, to: to || undefined } : undefined;
    try {
      let data: ReportResult;
      if (tab === "orgs-weekly") data = await getOrgWeeklyReport(range);
      else if (tab === "orgs-monthly") data = await getOrgMonthlyReport(range);
      else if (tab === "users-weekly") data = await getUserWeeklyReport(range);
      else data = await getUserMonthlyReport(range);
      setReport(data ?? EMPTY);
    } catch (err) {
      setReport(EMPTY);
      setError(getErrorMessage(err, "Failed to load report"));
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (id: string) => {
    setActiveTab(id);
    setReport(EMPTY);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Reports</h1>

      {error ? <ErrorBanner message={error} onRetry={() => load()} /> : null}

      <Card>
        <CardHeader><CardTitle className="text-base">Date Range (optional)</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5">
              <Label>From</Label>
              <DateOnlyInput value={from} onChange={setFrom} className="w-40" />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <DateOnlyInput value={to} onChange={setTo} className="w-40" />
            </div>
            <Button onClick={() => load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Load Report"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Tabs tabs={TABS} activeTab={activeTab} onTabChange={handleTabChange} />
        <Card>
          <CardContent className="p-0 pt-2">
            <ReportTable
              report={report}
              nameKey={nameKey as "organization_name" | "username"}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
