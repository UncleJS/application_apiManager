import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import LoginPage from "./pages/LoginPage";
import OrgsPage from "./pages/OrgsPage";
import UsersPage from "./pages/UsersPage";
import ApisPage from "./pages/ApisPage";
import ReportsPage from "./pages/ReportsPage";
import { clearToken, getToken } from "./api";
import { parseJwt } from "./utils/auth";

export default function App() {
  const [token, setTokenState] = useState(getToken());
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => setTokenState(getToken());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const identity = useMemo(() => (token ? parseJwt(token) : null), [token]);
  const displayName = identity?.username ? identity.username : identity ? `User ${identity.userId}` : "";

  useEffect(() => {
    if (token && !identity) {
      clearToken();
      setTokenState(null);
      navigate("/login");
    }
  }, [token, identity, navigate]);

  const handleLogout = () => {
    clearToken();
    setTokenState(null);
    navigate("/login");
  };

  if (!token || !identity) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage onLogin={() => setTokenState(getToken())} />} />
      </Routes>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">API Manager</div>
        {displayName && <div className="muted">Signed in as {displayName}</div>}
        <nav className="nav">
          {identity.role === "global_admin" && <NavLink to="/orgs">Organizations</NavLink>}
          <NavLink to="/users">Users</NavLink>
          <NavLink to="/apis">APIs</NavLink>
          <NavLink to="/reports">Reports</NavLink>
          <button className="secondary" onClick={handleLogout}>
            Sign out
          </button>
        </nav>
      </aside>
      <main className="content">
        <Routes>
          {identity.role === "global_admin" && <Route path="/orgs" element={<OrgsPage />} />}
          <Route path="/users" element={<UsersPage role={identity.role} organizationId={identity.organizationId} />} />
          <Route path="/apis" element={<ApisPage role={identity.role} organizationId={identity.organizationId} />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="*" element={<ApisPage role={identity.role} organizationId={identity.organizationId} />} />
        </Routes>
      </main>
    </div>
  );
}
