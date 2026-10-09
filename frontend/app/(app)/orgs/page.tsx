"use client";

import { useCallback, useEffect, useState } from "react";
import {
  archiveOrg,
  createOrg,
  getOrgs,
  unarchiveOrg,
  updateOrg,
  type Org,
} from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { Plus, Pencil, Archive } from "lucide-react";
import ErrorBanner from "@/components/ErrorBanner";
import RoleGate from "@/components/RoleGate";
import { getErrorMessage } from "@/lib/page-utils";

export default function OrgsPage() {
  const [items, setItems] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create form
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editTarget, setEditTarget] = useState<Org | null>(null);
  const [editName, setEditName] = useState("");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getOrgs();
      setItems(data.items);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load organizations"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (createName.trim().length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }
    setCreating(true);
    setError("");
    try {
      await createOrg({ name: createName.trim() });
      setCreateName("");
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create organization"));
    } finally {
      setCreating(false);
    }
  };

  const handleEditOpen = (org: Org) => {
    setEditTarget(org);
    setEditName(org.name);
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    setEditing(true);
    setError("");
    try {
      await updateOrg(editTarget.id, { name: editName.trim() });
      setEditTarget(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update organization"));
    } finally {
      setEditing(false);
    }
  };

  const handleUnarchive = async (id: number) => {
    setError("");
    try {
      await unarchiveOrg(id);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to unarchive organization"));
    }
  };

  const handleArchive = async (id: number) => {
    if (!confirm("Archive this organisation?")) return;
    setError("");
    try {
      await archiveOrg(id);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to archive organization"));
    }
  };

  return (
    <RoleGate roles={["global_admin"]}>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Organizations</h1>
      </div>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {/* Create form */}
      <Card>
        <CardHeader><CardTitle className="text-base">New Organisation</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="org-name">Name</Label>
              <Input
                id="org-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Organisation name"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <Button onClick={handleCreate} disabled={creating || createName.trim().length < 2}>
              <Plus className="h-4 w-4 mr-1" />
              Create
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-foreground/70 py-8">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-foreground/70 py-8">
                    No organisations found.
                  </TableCell>
                </TableRow>
              )}
              {items.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell>
                    <Badge variant={org.status_name === "active" ? "success" : "secondary"}>
                      {org.status_name}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEditOpen(org)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                      {org.status_name === "active" ? (
                        <Button variant="destructive" size="sm" onClick={() => handleArchive(org.id)}>
                          <Archive className="h-3.5 w-3.5 mr-1" />
                          Archive
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => handleUnarchive(org.id)}>
                          Unarchive
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Organisation"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-org-name">Name</Label>
            <Input
              id="edit-org-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEditSave()}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={editing || !editName.trim()}>
              Save
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
    </RoleGate>
  );
}
