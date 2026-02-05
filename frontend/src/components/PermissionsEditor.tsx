import { useEffect, useState } from "react";
import { assignPermission, getApis, getPermissions, unassignPermission } from "../api";

type Props = {
  userId: number;
  organizationId: number;
};

export default function PermissionsEditor({ userId, organizationId }: Props) {
  const [apis, setApis] = useState<any[]>([]);
  const [assigned, setAssigned] = useState<number[]>([]);

  const load = async () => {
    const apiData = await getApis();
    const filtered = apiData.items.filter((api) => api.organization_id === organizationId);
    setApis(filtered);
    const permissions = await getPermissions(userId);
    setAssigned(permissions.items);
  };

  useEffect(() => {
    load();
  }, [userId]);

  const toggle = async (apiId: number) => {
    if (assigned.includes(apiId)) {
      await unassignPermission({ userId, apiId });
      setAssigned((prev) => prev.filter((id) => id !== apiId));
      return;
    }
    await assignPermission({ userId, apiId });
    setAssigned((prev) => [...prev, apiId]);
  };

  return (
    <div className="card">
      <h3>Assigned APIs</h3>
      <div className="grid two">
        {apis.map((api) => (
          <label key={api.id}>
            <input
              type="checkbox"
              checked={assigned.includes(api.id)}
              onChange={() => toggle(api.id)}
            />{" "}
            {api.name}
          </label>
        ))}
      </div>
    </div>
  );
}
