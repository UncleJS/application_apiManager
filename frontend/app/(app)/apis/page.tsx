"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  archiveApi, createApi, getApis, getOrgs, unarchiveApi, updateApi,
  type ApiRecord, type Org,
} from "@/lib/api";
import {
  Badge, Button, Card, CardContent,
  Dialog, Input, Label, SelectNative,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui";
import WindowsEditor from "@/components/WindowsEditor";
import { useAuth } from "@/lib/auth-context";
import { normalizeRole } from "@/lib/utils";
import { Plus, Pencil, Archive, ChevronDown, ChevronUp } from "lucide-react";
import ErrorBanner from "@/components/ErrorBanner";
import RoleGate from "@/components/RoleGate";
import { getErrorMessage } from "@/lib/page-utils";

export default function ApisPage() {
  const { user: me } = useAuth();
  const role = normalizeRole(me?.role ?? me?.role_name ?? "");
  const orgId = me?.organization_id ?? 0;

  const [apis, setApis] = useState<ApiRecord[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [error, setError] = useState("");

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "", basePath: "", targetUrl: "",
    isPublic: false, isEnabled: true, alwaysOn: false,
    organizationId: 0,
  });

  // Edit modal
  const [editTarget, setEditTarget] = useState<ApiRecord | null>(null);
  const [editForm, setEditForm] = useState({
    name: "", basePath: "", targetUrl: "",
    isPublic: false, isEnabled: true, alwaysOn: false,
    organizationId: 0,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ad, od] = await Promise.all([
        getApis(),
        role === "user" ? Promise.resolve({ items: [] as Org[] }) : getOrgs(),
      ]);
      const visibleApis = role === "global_admin" ? ad.items : ad.items.filter((a) => Number(a.organization_id) === Number(orgId));
      setApis(visibleApis);
      setOrgs(od.items);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load APIs"));
    } finally {
      setLoading(false);
    }
  }, [orgId, role]);

  useEffect(() => { load(); }, [load]);

  const defaultOrgId = role === "global_admin" ? (orgs[0]?.id ?? 0) : orgId;
  const visibleOrgs = role === "global_admin" ? orgs : orgs.filter((o) => o.id === orgId);

  const handleCreate = async () => {
    if (createForm.name.trim().length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }
    if (!createForm.basePath.startsWith("/") || createForm.basePath.trim().length < 2) {
      setError("Base path must start with / and be at least 2 characters");
      return;
    }
    try {
      const target = new URL(createForm.targetUrl);
      if (!["http:", "https:"].includes(target.protocol)) {
        setError("Target URL must use http or https");
        return;
      }
    } catch {
      setError("Target URL must be a valid absolute URL");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createApi({
        ...createForm,
        organizationId: createForm.organizationId || defaultOrgId,
      });
      setShowCreate(false);
      setCreateForm({ name: "", basePath: "", targetUrl: "", isPublic: false, isEnabled: true, alwaysOn: false, organizationId: 0 });
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create API"));
    } finally {
      setSaving(false);
    }
  };

  const handleEditOpen = (api: ApiRecord) => {
    setEditTarget(api);
    setEditForm({
      name: api.name,
      basePath: api.base_path,
      targetUrl: api.target_url,
      isPublic: api.is_public,
      isEnabled: api.is_enabled,
      alwaysOn: api.always_on,
      organizationId: api.organization_id,
    });
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    setSaving(true);
    setError("");
    try {
      await updateApi(editTarget.id, {
        name: editForm.name,
        basePath: editForm.basePath,
        targetUrl: editForm.targetUrl,
        isPublic: editForm.isPublic,
        isEnabled: editForm.isEnabled,
        alwaysOn: editForm.alwaysOn,
        organizationId: editForm.organizationId,
      });
      setEditTarget(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update API"));
    } finally {
      setSaving(false);
    }
  };

  const handleUnarchive = async (id: number) => {
    setError("");
    try {
      await unarchiveApi(id);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to unarchive API"));
    }
  };

  const handleArchive = async (id: number) => {
    if (!confirm("Archive this API?")) return;
    setError("");
    try {
      await archiveApi(id);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to archive API"));
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <RoleGate roles={["global_admin", "org_admin", "user"]}>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">APIs</h1>
        {(role === "global_admin" || role === "org_admin") && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add API
          </Button>
        )}
      </div>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Base Path</TableHead>
                <TableHead>Organisation</TableHead>
                <TableHead>Public</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-foreground/70">Loading…</TableCell></TableRow>
              )}
              {!loading && apis.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-foreground/70">No APIs found.</TableCell></TableRow>
              )}
              {apis.map((api) => (
                <Fragment key={api.id}>
                  <TableRow>
                    <TableCell className="font-medium">{api.name}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground/70">{api.base_path}</TableCell>
                    <TableCell>{api.organization_name}</TableCell>
                    <TableCell>
                      <Badge variant={api.is_public ? "success" : "secondary"}>
                        {api.is_public ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={api.is_enabled ? "default" : "secondary"}>
                        {api.is_enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1 flex-wrap">
                        {(role === "global_admin" || role === "org_admin") && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => handleEditOpen(api)}>
                              <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className={expandedId === api.id ? "text-primary" : "text-foreground/70"}
                              onClick={() => toggleExpand(api.id)}
                            >
                              Windows {expandedId === api.id ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
                            </Button>
                            {api.is_enabled ? (
                              <Button variant="destructive" size="sm" onClick={() => handleArchive(api.id)}>
                                <Archive className="h-3.5 w-3.5 mr-1" />Archive
                              </Button>
                            ) : (
                              <Button variant="outline" size="sm" onClick={() => handleUnarchive(api.id)}>
                                Unarchive
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedId === api.id && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-muted/20 p-4">
                        <WindowsEditor subjectType="api" subjectId={api.id} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)} title="Add API">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Name</Label>
              <Input value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Base Path</Label>
              <Input value={createForm.basePath} onChange={(e) => setCreateForm((f) => ({ ...f, basePath: e.target.value }))} placeholder="/api/v1/..." />
            </div>
            <div className="space-y-1.5">
              <Label>Target URL</Label>
              <Input value={createForm.targetUrl} onChange={(e) => setCreateForm((f) => ({ ...f, targetUrl: e.target.value }))} placeholder="https://..." />
            </div>
            {role === "global_admin" && (
              <div className="space-y-1.5">
                <Label>Organisation</Label>
                <SelectNative
                  value={createForm.organizationId || defaultOrgId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, organizationId: Number(e.target.value) }))}
                >
                  {visibleOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </SelectNative>
              </div>
            )}
            <div className="flex items-center gap-4 col-span-2">
              {(["isPublic", "isEnabled", "alwaysOn"] as const).map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createForm[key]}
                    onChange={(e) => setCreateForm((f) => ({ ...f, [key]: e.target.checked }))}
                  />
                  {key === "isPublic" ? "Public" : key === "isEnabled" ? "Enabled" : "Always On"}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || createForm.name.trim().length < 2 || createForm.basePath.trim().length < 2 || !createForm.targetUrl.trim()}>Create</Button>
          </div>
        </div>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit API">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Base Path</Label>
              <Input value={editForm.basePath} onChange={(e) => setEditForm((f) => ({ ...f, basePath: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Target URL</Label>
              <Input value={editForm.targetUrl} onChange={(e) => setEditForm((f) => ({ ...f, targetUrl: e.target.value }))} />
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
            <div className="flex items-center gap-4 col-span-2">
              {(["isPublic", "isEnabled", "alwaysOn"] as const).map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm[key]}
                    onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.checked }))}
                  />
                  {key === "isPublic" ? "Public" : key === "isEnabled" ? "Enabled" : "Always On"}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={saving}>Save</Button>
          </div>
        </div>
      </Dialog>
    </div>
    </RoleGate>
  );
}
