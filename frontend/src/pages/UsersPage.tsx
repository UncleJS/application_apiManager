import { useEffect, useMemo, useState } from "react";
import {
  archiveUser,
  createUser,
  getLookups,
  getOrgs,
  getUsers,
  updateUser
} from "../api";
import PermissionsEditor from "../components/PermissionsEditor";
import WindowsEditor from "../components/WindowsEditor";

type Props = {
  role: string;
  organizationId: number;
};

export default function UsersPage({ role, organizationId }: Props) {
  const [users, setUsers] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState({ username: "", password: "", organizationId, roleId: 0 });

  const selectedUser = useMemo(() => users.find((user) => user.id === selectedId), [users, selectedId]);

  const load = async () => {
    const [userData, lookupData] = await Promise.all([getUsers(), getLookups()]);
    setUsers(userData.items);
    setRoles(lookupData.roles);
    setStatuses(lookupData.userStatuses);

    if (role === "global_admin") {
      const orgData = await getOrgs();
      setOrgs(orgData.items);
    } else {
      setOrgs([{ id: organizationId, name: "Current Org" }]);
    }

    if (!selectedId && userData.items.length > 0) {
      setSelectedId(userData.items[0].id);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!form.username || !form.password || !form.organizationId || !form.roleId) {
      return;
    }
    await createUser(form);
    setForm({ username: "", password: "", organizationId, roleId: 0 });
    await load();
  };

  const handleArchive = async (id: number) => {
    await archiveUser(id);
    await load();
  };

  const handleUpdate = async (id: number, payload: any) => {
    await updateUser(id, payload);
    await load();
  };

  return (
    <div>
      <h1 className="page-title">Users</h1>
      <div className="card">
        <h3>Create user</h3>
        <div className="form-row">
          <div>
            <label>Username</label>
            <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
          </div>
          <div>
            <label>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </div>
          <div>
            <label>Organization</label>
            <select
              value={form.organizationId}
              onChange={(event) => setForm({ ...form, organizationId: Number(event.target.value) })}
              disabled={role !== "global_admin"}
            >
              <option value={0}>Select</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Role</label>
            <select value={form.roleId} onChange={(event) => setForm({ ...form, roleId: Number(event.target.value) })}>
              <option value={0}>Select</option>
              {roles.map((roleOption) => (
                <option key={roleOption.id} value={roleOption.id}>
                  {roleOption.name}
                </option>
              ))}
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
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>{user.role_name}</td>
                <td>{user.status_name}</td>
                <td>
                  <button className="secondary" onClick={() => setSelectedId(user.id)}>
                    Manage
                  </button>
                  <button className="secondary" onClick={() => handleArchive(user.id)}>
                    Archive
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <div className="card">
          <h3>Manage {selectedUser.username}</h3>
          <div className="form-row">
            <div>
              <label>Role</label>
              <select
                value={selectedUser.role_id}
                onChange={(event) => handleUpdate(selectedUser.id, { roleId: Number(event.target.value) })}
              >
                {roles.map((roleOption) => (
                  <option key={roleOption.id} value={roleOption.id}>
                    {roleOption.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Status</label>
              <select
                value={selectedUser.status_id}
                onChange={(event) => handleUpdate(selectedUser.id, { statusId: Number(event.target.value) })}
              >
                {statuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <PermissionsEditor userId={selectedUser.id} organizationId={selectedUser.organization_id} />
          {role !== "global_admin" && selectedUser.role_name !== "global_admin" && (
            <WindowsEditor subjectType="user" subjectId={selectedUser.id} />
          )}
        </div>
      )}
    </div>
  );
}
