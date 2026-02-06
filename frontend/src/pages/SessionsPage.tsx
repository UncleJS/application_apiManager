import { useEffect, useMemo, useState } from "react";
import { getOrgs, getSessions, getUsers, revokeSession } from "../api";
import { formatSast, getSessionStatus } from "../utils/time";

type Props = {
  role: string;
  organizationId: number;
};

export default function SessionsPage({ role, organizationId }: Props) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [filterUserId, setFilterUserId] = useState<number | "all">("all");
  const [filterOrgId, setFilterOrgId] = useState<number | "all">("all");
  const [filterStatus, setFilterStatus] = useState<"active" | "revoked" | "expired" | "all">("active");

  const load = async () => {
    const [sessionData, userData, orgData] = await Promise.all([
      getSessions({
        userId: filterUserId === "all" ? undefined : filterUserId,
        orgId: role === "global_admin" && filterOrgId !== "all" ? filterOrgId : undefined
      }),
      getUsers(),
      role === "global_admin" ? getOrgs() : Promise.resolve({ items: [{ id: organizationId, name: "Current Org" }] })
    ]);
    setSessions(sessionData.items);
    setUsers(userData.items);
    setOrgs(orgData.items);
  };

  useEffect(() => {
    load();
  }, [filterUserId, filterOrgId]);

  const filteredUsers = useMemo(() => {
    if (role !== "global_admin" || filterOrgId === "all") {
      return users;
    }
    return users.filter((user) => user.organization_id === filterOrgId);
  }, [users, role, filterOrgId]);

  useEffect(() => {
    if (filterUserId === "all") {
      return;
    }
    const stillVisible = filteredUsers.some((user) => user.id === filterUserId);
    if (!stillVisible) {
      setFilterUserId("all");
    }
  }, [filterUserId, filteredUsers]);

  const filteredSessions = sessions.filter((session) => {
    if (filterStatus === "all") {
      return true;
    }
    return getSessionStatus(session).toLowerCase() === filterStatus;
  });

  const handleRevoke = async (sessionId: number) => {
    await revokeSession(sessionId);
    await load();
  };

  return (
    <div>
      <h1 className="page-title">Sessions</h1>
      <div className="card">
        <div className="form-row">
          {role === "global_admin" && (
            <div>
              <label>Organization filter</label>
              <select
                value={filterOrgId}
                onChange={(event) => {
                  const value = event.target.value;
                  const nextOrgId = value === "all" ? "all" : Number(value);
                  setFilterOrgId(nextOrgId);
                  setFilterUserId("all");
                }}
              >
                <option value="all">All organizations</option>
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label>User filter</label>
            <select
              value={filterUserId}
              onChange={(event) => {
                const value = event.target.value;
                setFilterUserId(value === "all" ? "all" : Number(value));
              }}
            >
              <option value="all">All users</option>
              {filteredUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Status filter</label>
            <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as typeof filterStatus)}>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="revoked">Revoked</option>
              <option value="all">All</option>
            </select>
          </div>
          <div>
            <label>&nbsp;</label>
            <button onClick={load}>Refresh</button>
          </div>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Organization</th>
              <th>Role</th>
              <th>Last activity (SAST)</th>
              <th>Expires (SAST)</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSessions.map((session) => {
              const status = getSessionStatus(session);
              return (
                <tr key={session.id}>
                  <td>{session.username}</td>
                  <td>{session.organization_name ?? session.organization_id}</td>
                  <td>{session.role}</td>
                  <td>{formatSast(session.last_activity_utc)}</td>
                  <td>{formatSast(session.expires_at_utc)}</td>
                  <td>{status}</td>
                  <td>
                    {status === "Active" && (
                      <button className="secondary" onClick={() => handleRevoke(session.id)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
