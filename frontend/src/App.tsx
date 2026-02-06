import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import LoginPage from "./pages/LoginPage";
import OrgsPage from "./pages/OrgsPage";
import UsersPage from "./pages/UsersPage";
import ApisPage from "./pages/ApisPage";
import ReportsPage from "./pages/ReportsPage";
import SessionsPage from "./pages/SessionsPage";
import { getMe, logout } from "./api";

export default function App() {
  const [identity, setIdentity] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const displayName = identity?.username ? identity.username : identity ? `User ${identity.id}` : "";
  const rawRole = identity?.role ?? identity?.role_name ?? identity?.roleName ?? identity?.role?.name ?? "";
  const role = String(rawRole)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const organizationId = identity?.organizationId ?? identity?.organization_id ?? 0;

  const loadIdentity = async () => {
    try {
      const data = await getMe();
      setIdentity(data.user);
    } catch {
      setIdentity(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIdentity();
  }, []);

  useEffect(() => {
    const handler = () => {
      setIdentity(null);
      navigate("/login");
    };
    window.addEventListener("auth:required", handler);
    return () => window.removeEventListener("auth:required", handler);
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setIdentity(null);
      navigate("/login");
    }
  };

  if (loading) {
    return null;
  }

  if (!identity) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage onLogin={loadIdentity} />} />
      </Routes>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">API Manager</div>
        {displayName && <div className="muted user-info">Signed in as {displayName}</div>}
        <nav className="nav">
          {role === "global_admin" && <NavLink to="/orgs">Organizations</NavLink>}
          <NavLink to="/users">Users</NavLink>
          <NavLink to="/apis">APIs</NavLink>
          <NavLink to="/reports">Reports</NavLink>
          {(role === "global_admin" || role === "org_admin") && (
            <NavLink to="/sessions">Sessions</NavLink>
          )}
          <button className="secondary" onClick={handleLogout}>
            Sign out
          </button>
        </nav>
      </aside>
      <main className="content">
        <Routes>
          {role === "global_admin" && <Route path="/orgs" element={<OrgsPage />} />}
          <Route path="/users" element={<UsersPage role={role} organizationId={organizationId} />} />
          <Route path="/apis" element={<ApisPage role={role} organizationId={organizationId} />} />
          <Route path="/reports" element={<ReportsPage />} />
          {(role === "global_admin" || role === "org_admin") && (
            <Route path="/sessions" element={<SessionsPage role={role} organizationId={organizationId} />} />
          )}
          <Route path="*" element={<ApisPage role={role} organizationId={organizationId} />} />
        </Routes>
      </main>
    </div>
  );
}
