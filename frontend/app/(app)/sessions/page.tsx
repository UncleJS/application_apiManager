"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getOrgs, getSessions, getUsers, revokeSession,
  type Org, type Session, type User,
} from "@/lib/api";
import {
  Badge, Button, Card, CardContent, Label, SelectNative,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { formatSast, normalizeRole, parseUtcDate } from "@/lib/utils";
import { ShieldOff } from "lucide-react";
import ErrorBanner from "@/components/ErrorBanner";
import RoleGate from "@/components/RoleGate";
import { getErrorMessage } from "@/lib/page-utils";

function getSessionStatus(s: Session): "active" | "revoked" | "expired" {
  if (s.revoked_at_utc) return "revoked";
  const expiresAt = parseUtcDate(s.expires_at_utc);
  if (expiresAt && expiresAt < new Date()) return "expired";
  return "active";
}

export default function SessionsPage() {
  const { user: me } = useAuth();
  const role = normalizeRole(me?.role ?? me?.role_name ?? "");
  const orgId = me?.organization_id ?? 0;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [filterUserId, setFilterUserId] = useState<number>(0);
  const [filterOrgId, setFilterOrgId] = useState<number>(0);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const opts = role === "global_admin" ? {} : { orgId };
      const [sd, ud, od] = await Promise.all([
        getSessions(opts),
        getUsers(),
        role === "global_admin" ? getOrgs() : Promise.resolve({ items: [] as Org[] }),
      ]);
      setSessions(sd.items);
      setUsers(ud.items);
      setOrgs(od.items);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load sessions"));
    } finally {
      setLoading(false);
    }
  }, [orgId, role]);

  useEffect(() => { load(); }, [load]);

  const handleRevoke = async (id: number) => {
    if (!confirm("Revoke this session?")) return;
    setError("");
    try {
      await revokeSession(id);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to revoke session"));
    }
  };

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (filterUserId && Number(s.user_id) !== Number(filterUserId)) return false;
      if (filterOrgId && Number(s.organization_id) !== Number(filterOrgId)) return false;
      const status = getSessionStatus(s);
      if (filterStatus !== "all" && status !== filterStatus) return false;
      return true;
    });
  }, [sessions, filterUserId, filterOrgId, filterStatus]);

  const visibleOrgs = role === "global_admin" ? orgs : orgs.filter((o) => Number(o.id) === Number(orgId));

  return (
    <RoleGate roles={["global_admin", "org_admin"]}>
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Sessions</h1>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        {role === "global_admin" && (
          <div className="space-y-1.5">
            <Label>Organisation</Label>
            <SelectNative
              className="w-44"
              value={filterOrgId}
              onChange={(e) => setFilterOrgId(Number(e.target.value))}
            >
              <option value={0}>All organisations</option>
              {visibleOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </SelectNative>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>User</Label>
          <SelectNative
            className="w-44"
            value={filterUserId}
            onChange={(e) => setFilterUserId(Number(e.target.value))}
          >
            <option value={0}>All users</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
          </SelectNative>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <SelectNative
            className="w-36"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
            <option value="expired">Expired</option>
          </SelectNative>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Organisation</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Created (SAST)</TableHead>
                <TableHead>Last Active (SAST)</TableHead>
                <TableHead>Expires (SAST)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-foreground/70">Loading…</TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-foreground/70">No sessions found.</TableCell></TableRow>
              )}
              {filtered.map((s) => {
                const status = getSessionStatus(s);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.username}</TableCell>
                    <TableCell>{s.organization_name}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground/70">{s.client_ip ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{formatSast(s.created_at_utc)}</TableCell>
                    <TableCell className="font-mono text-xs">{formatSast(s.last_activity_utc)}</TableCell>
                    <TableCell className="font-mono text-xs">{formatSast(s.expires_at_utc)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={status === "active" ? "success" : status === "revoked" ? "destructive" : "secondary"}
                      >
                        {status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {status === "active" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRevoke(s.id)}
                        >
                          <ShieldOff className="h-3.5 w-3.5 mr-1" />
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
    </RoleGate>
  );
}
