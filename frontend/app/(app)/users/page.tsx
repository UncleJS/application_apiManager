"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  archiveUser, createUser, getOrgs, getLookups, getUsers, updateUser,
  type Org, type User,
} from "@/lib/api";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle,
  Dialog, Input, Label, SelectNative,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui";
import PermissionsEditor from "@/components/PermissionsEditor";
import WindowsEditor from "@/components/WindowsEditor";
import { useAuth } from "@/lib/auth-context";
import { normalizeRole } from "@/lib/utils";
import { Plus, Pencil, Archive, ChevronDown, ChevronUp } from "lucide-react";
import ErrorBanner from "@/components/ErrorBanner";
import { getErrorMessage } from "@/lib/page-utils";

export default function UsersPage() {
  const { user: me } = useAuth();
  const role = normalizeRole(me?.role ?? me?.role_name ?? "");
  const orgId = me?.organization_id ?? 0;

  const [users, setUsers] = useState<User[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [roles, setRoles] = useState<{ id: number; name: string }[]>([]);
  const [statuses, setStatuses] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Expanded user for sub-editors
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedTab, setExpandedTab] = useState<"permissions" | "windows">("permissions");

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: "", password: "", organizationId: 0, roleId: 0,
  });

  // Edit modal
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    username: "", password: "", organizationId: 0, roleId: 0, statusId: 0,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ud, od, ld] = await Promise.all([getUsers(), getOrgs(), getLookups()]);
      const visibleUsers = role === "global_admin" ? ud.items : ud.items.filter((u) => u.organization_id === orgId);
      setUsers(visibleUsers);
      setOrgs(od.items);
      setRoles(ld.roles);
      setStatuses(ld.userStatuses);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load users"));
    } finally {
      setLoading(false);
    }
  }, [orgId, role]);

  useEffect(() => { load(); }, [load]);

  const defaultOrgId = role === "global_admin" ? (orgs[0]?.id ?? 0) : orgId;
  const visibleOrgs = role === "global_admin" ? orgs : orgs.filter((o) => o.id === orgId);

  const handleCreate = async () => {
    setSaving(true);
    setError("");
    try {
      await createUser({
        username: createForm.username,
        password: createForm.password,
        organizationId: createForm.organizationId || defaultOrgId,
        roleId: createForm.roleId || (roles[0]?.id ?? 0),
      });
      setShowCreate(false);
      setCreateForm({ username: "", password: "", organizationId: 0, roleId: 0 });
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create user"));
    } finally {
      setSaving(false);
    }
  };

  const handleEditOpen = (u: User) => {
    setEditTarget(u);
    setEditForm({
      username: u.username,
      password: "",
      organizationId: u.organization_id,
      roleId: roles.find((r) => r.name === u.role_name)?.id ?? 0,
      statusId: u.status_id ?? 0,
    });
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        username: editForm.username,
        organizationId: editForm.organizationId,
        roleId: editForm.roleId,
        statusId: editForm.statusId,
      };
      if (editForm.password) payload.password = editForm.password;
      await updateUser(editTarget.id, payload as Parameters<typeof updateUser>[1]);
      setEditTarget(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update user"));
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (id: number) => {
    if (!confirm("Archive this user?")) return;
    setError("");
    try {
      await archiveUser(id);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to archive user"));
    }
  };

  const toggleExpand = (id: number, tab: "permissions" | "windows") => {
    if (expandedId === id && expandedTab === tab) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      setExpandedTab(tab);
    }
  };

  const expandedUser = useMemo(() => users.find((u) => u.id === expandedId), [users, expandedId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        {(role === "global_admin" || role === "org_admin") && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add User
          </Button>
        )}
      </div>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Organisation</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!loading && users.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No users found.</TableCell></TableRow>
              )}
              {users.map((u) => (
                <>
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>{u.organization_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{u.role_name}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.status_name === "active" ? "success" : "destructive"}>
                        {u.status_name}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1 flex-wrap">
                        <Button variant="outline" size="sm" onClick={() => handleEditOpen(u)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className={expandedId === u.id && expandedTab === "permissions" ? "text-primary" : "text-muted-foreground"}
                          onClick={() => toggleExpand(u.id, "permissions")}
                        >
                          Perms {expandedId === u.id && expandedTab === "permissions" ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className={expandedId === u.id && expandedTab === "windows" ? "text-primary" : "text-muted-foreground"}
                          onClick={() => toggleExpand(u.id, "windows")}
                        >
                          Windows {expandedId === u.id && expandedTab === "windows" ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
                        </Button>
                        {(role === "global_admin" || role === "org_admin") && (
                          <Button variant="destructive" size="sm" onClick={() => handleArchive(u.id)}>
                            <Archive className="h-3.5 w-3.5 mr-1" />Archive
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedId === u.id && (
                    <TableRow key={"exp-" + u.id}>
                      <TableCell colSpan={5} className="bg-muted/20 p-4">
                        {expandedTab === "permissions" && (
                          <PermissionsEditor userId={u.id} organizationId={u.organization_id} />
                        )}
                        {expandedTab === "windows" && (
                          <WindowsEditor subjectType="user" subjectId={u.id} />
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)} title="Add User">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input value={createForm.username} onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Organisation</Label>
              <SelectNative
                value={createForm.organizationId || defaultOrgId}
                onChange={(e) => setCreateForm((f) => ({ ...f, organizationId: Number(e.target.value) }))}
              >
                {visibleOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </SelectNative>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <SelectNative
                value={createForm.roleId || (roles[0]?.id ?? 0)}
                onChange={(e) => setCreateForm((f) => ({ ...f, roleId: Number(e.target.value) }))}
              >
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </SelectNative>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !createForm.username}>Create</Button>
          </div>
        </div>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit User">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input value={editForm.username} onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>New Password (leave blank to keep)</Label>
              <Input type="password" value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
            {role === "global_admin" && (
              <div className="space-y-1.5">
                <Label>Organisation</Label>
                <SelectNative
                  value={editForm.organizationId}
                  onChange={(e) => setEditForm((f) => ({ ...f, organizationId: Number(e.target.value) }))}
                >
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </SelectNative>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Role</Label>
              <SelectNative
                value={editForm.roleId}
                onChange={(e) => setEditForm((f) => ({ ...f, roleId: Number(e.target.value) }))}
              >
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </SelectNative>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <SelectNative
                value={editForm.statusId}
                onChange={(e) => setEditForm((f) => ({ ...f, statusId: Number(e.target.value) }))}
              >
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </SelectNative>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={saving}>Save</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
