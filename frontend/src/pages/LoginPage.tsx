import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api";

type Props = {
  onLogin: () => void;
};

export default function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await login(username, password);
      onLogin();
      navigate("/apis");
    } catch (err: any) {
      const message = err?.message ?? "Login failed";
      if (message.includes("Failed to fetch")) {
        setError("TLS certificate not trusted. Visit https://localhost:55001 and accept it, then retry.");
        return;
      }
      setError(message);
    }
  };

  return (
    <div className="login-shell">
      <div className="card login-card">
        <h1 className="page-title">API Manager Login</h1>
        <p className="muted">Use your admin credentials to access the console.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div>
              <label>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div>
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          {error && <p className="tag">{error}</p>}
          <button type="submit">Sign in</button>
        </form>
      </div>
    </div>
  );
}
