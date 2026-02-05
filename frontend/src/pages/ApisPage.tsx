import { useEffect, useMemo, useState } from "react";
import { archiveApi, createApi, getApis, getOrgs, updateApi } from "../api";
import WindowsEditor from "../components/WindowsEditor";

type Props = {
  role: string;
  organizationId: number;
};

export default function ApisPage({ role, organizationId }: Props) {
  const [apis, setApis] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState({
    organizationId,
    name: "",
    basePath: "",
    targetUrl: "",
    isPublic: false,
    isEnabled: true,
    alwaysOn: false
  });

  const selectedApi = useMemo(() => apis.find((api) => api.id === selectedId), [apis, selectedId]);

  const load = async () => {
    const apiData = await getApis();
    setApis(apiData.items);
    if (role === "global_admin") {
      const orgData = await getOrgs();
      setOrgs(orgData.items);
    } else {
      setOrgs([{ id: organizationId, name: "Current Org" }]);
    }
    if (!selectedId && apiData.items.length > 0) {
      setSelectedId(apiData.items[0].id);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    await createApi(form);
    setForm({
      organizationId,
      name: "",
      basePath: "",
      targetUrl: "",
      isPublic: false,
      isEnabled: true,
      alwaysOn: false
    });
    await load();
  };

  const handleArchive = async (id: number) => {
    await archiveApi(id);
    await load();
  };

  const handleUpdate = async (id: number, payload: any) => {
    await updateApi(id, payload);
    await load();
  };

  return (
    <div>
      <h1 className="page-title">APIs</h1>
      <div className="card">
        <h3>Create API</h3>
        <div className="form-row">
          <div>
            <label>Organization</label>
          <select
            value={form.organizationId}
            onChange={(event) => setForm({ ...form, organizationId: Number(event.target.value) })}
            disabled={role !== "global_admin"}
          >
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Name</label>
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div>
            <label>Base path</label>
            <input value={form.basePath} onChange={(event) => setForm({ ...form, basePath: event.target.value })} />
          </div>
          <div>
            <label>Target URL</label>
            <input value={form.targetUrl} onChange={(event) => setForm({ ...form, targetUrl: event.target.value })} />
          </div>
          <div>
            <label>Public</label>
            <select value={form.isPublic ? "yes" : "no"} onChange={(event) => setForm({ ...form, isPublic: event.target.value === "yes" })}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
          <div>
            <label>Always on</label>
            <select value={form.alwaysOn ? "yes" : "no"} onChange={(event) => setForm({ ...form, alwaysOn: event.target.value === "yes" })}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
          <div>
            <label>&nbsp;</label>
            <button onClick={handleCreate}>Create</button>
          </div>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Organization</th>
              <th>Base path</th>
              <th>Public</th>
              <th>Always on</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {apis.map((api) => (
              <tr key={api.id}>
                <td>{api.name}</td>
                <td>{api.organization_name ?? api.organization_id}</td>
                <td>{api.base_path}</td>
                <td>{api.is_public ? "Yes" : "No"}</td>
                <td>{api.always_on ? "Yes" : "No"}</td>
                <td>
                  <button className="secondary" onClick={() => setSelectedId(api.id)}>
                    Manage
                  </button>
                  {role !== "user" && (
                    <button className="secondary" onClick={() => handleArchive(api.id)}>
                      Archive
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedApi && (
        <div className="card">
          <h3>Manage {selectedApi.name}</h3>
          <div className="form-row">
            <div>
              <label>Organization</label>
              {role === "global_admin" ? (
                <select
                  value={selectedApi.organization_id}
                  onChange={(event) =>
                    handleUpdate(selectedApi.id, { organizationId: Number(event.target.value) })
                  }
                >
                  {orgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={selectedApi.organization_name ?? selectedApi.organization_id} disabled />
              )}
            </div>
            <div>
              <label>Name</label>
              <input value={selectedApi.name} onChange={(event) => handleUpdate(selectedApi.id, { name: event.target.value })} />
            </div>
            <div>
              <label>Base path</label>
              <input
                value={selectedApi.base_path}
                onChange={(event) => handleUpdate(selectedApi.id, { basePath: event.target.value })}
              />
            </div>
            <div>
              <label>Target URL</label>
              <input
                value={selectedApi.target_url}
                onChange={(event) => handleUpdate(selectedApi.id, { targetUrl: event.target.value })}
              />
            </div>
            <div>
              <label>Public</label>
              <select
                value={selectedApi.is_public ? "yes" : "no"}
                onChange={(event) => handleUpdate(selectedApi.id, { isPublic: event.target.value === "yes" })}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            <div>
              <label>Always on</label>
              <select
                value={selectedApi.always_on ? "yes" : "no"}
                onChange={(event) => handleUpdate(selectedApi.id, { alwaysOn: event.target.value === "yes" })}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
          </div>
          {!selectedApi.always_on && <WindowsEditor subjectType="api" subjectId={selectedApi.id} />}
        </div>
      )}
    </div>
  );
}
