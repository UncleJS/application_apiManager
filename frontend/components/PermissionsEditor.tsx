"use client";

import { useCallback, useEffect, useState } from "react";
import { assignPermission, getApis, getPermissions, unassignPermission, type ApiRecord } from "@/lib/api";

interface Props {
  userId: number;
  organizationId: number;
}

export default function PermissionsEditor({ userId, organizationId }: Props) {
  const [apis, setApis] = useState<ApiRecord[]>([]);
  const [assigned, setAssigned] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [apiData, permData] = await Promise.all([getApis(), getPermissions(userId)]);
      setApis(apiData.items.filter((a) => a.organization_id === organizationId));
      setAssigned(permData.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load permissions");
    } finally {
      setLoading(false);
    }
  }, [organizationId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (apiId: number) => {
    const wasAssigned = assigned.includes(apiId);
    const nextAssigned = wasAssigned
      ? assigned.filter((id: number) => id !== apiId)
      : [...assigned, apiId];

    setError("");
    setAssigned(nextAssigned);

    try {
      if (wasAssigned) {
        await unassignPermission({ userId, apiId });
      } else {
        await assignPermission({ userId, apiId });
      }
    } catch (err) {
      setAssigned(assigned);
      setError(err instanceof Error ? err.message : "Failed to update permissions");
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading permissions…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (apis.length === 0) return <p className="text-sm text-muted-foreground">No APIs in this organisation.</p>;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Assigned APIs</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {apis.map((api) => (
          <label
            key={api.id}
            className="flex items-center gap-2 rounded-md border border-border bg-input px-3 py-2 text-sm cursor-pointer hover:border-primary/50 transition-colors"
          >
            <input
              type="checkbox"
              checked={assigned.includes(api.id)}
              onChange={() => toggle(api.id)}
              className="accent-primary"
              aria-label={`Toggle API permission for ${api.name}`}
            />
            <span>{api.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
