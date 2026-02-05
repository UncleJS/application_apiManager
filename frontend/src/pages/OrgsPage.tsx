import { useEffect, useState } from "react";
import { archiveOrg, createOrg, getOrgs } from "../api";

export default function OrgsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState("");

  const load = async () => {
    const data = await getOrgs();
    setItems(data.items);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) {
      return;
    }
    await createOrg({ name });
    setName("");
    await load();
  };

  const handleArchive = async (id: number) => {
    await archiveOrg(id);
    await load();
  };

  return (
    <div>
      <h1 className="page-title">Organizations</h1>
      <div className="card">
        <div className="form-row">
          <div>
            <label>New organization</label>
            <input value={name} onChange={(event) => setName(event.target.value)} />
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
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((org) => (
              <tr key={org.id}>
                <td>{org.name}</td>
                <td>{org.status_name}</td>
                <td>
                  <button className="secondary" onClick={() => handleArchive(org.id)}>
                    Archive
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
