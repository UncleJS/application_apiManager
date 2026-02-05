const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://localhost:55001";
let inMemoryToken: string | null = null;

export type ApiError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export function setToken(token: string) {
  inMemoryToken = token;
  try {
    localStorage.setItem("api-manager-token", token);
  } catch {
    // ignore storage failures
  }
}

export function getToken(): string | null {
  if (inMemoryToken) {
    return inMemoryToken;
  }
  try {
    return localStorage.getItem("api-manager-token");
  } catch {
    return null;
  }
}

export function clearToken() {
  inMemoryToken = null;
  try {
    localStorage.removeItem("api-manager-token");
  } catch {
    // ignore storage failures
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined)
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
    }
    throw payload || { code: "REQUEST_FAILED", message: "Request failed" };
  }

  return payload;
}

export async function login(username: string, password: string) {
  const data = await request<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  setToken(data.token);
  return data;
}

export async function getOrgs() {
  return request<{ items: any[] }>("/orgs");
}

export async function createOrg(payload: { name: string }) {
  return request("/orgs", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateOrg(id: number, payload: any) {
  return request(`/orgs/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function archiveOrg(id: number) {
  return request(`/orgs/${id}/archive`, { method: "POST" });
}

export async function getUsers() {
  return request<{ items: any[] }>("/users");
}

export async function createUser(payload: any) {
  return request("/users", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateUser(id: number, payload: any) {
  return request(`/users/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function archiveUser(id: number) {
  return request(`/users/${id}/archive`, { method: "POST" });
}

export async function getApis() {
  return request<{ items: any[] }>("/apis");
}

export async function createApi(payload: any) {
  return request("/apis", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateApi(id: number, payload: any) {
  return request(`/apis/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function archiveApi(id: number) {
  return request(`/apis/${id}/archive`, { method: "POST" });
}

export async function assignPermission(payload: { userId: number; apiId: number }) {
  return request("/permissions/assign", { method: "POST", body: JSON.stringify(payload) });
}

export async function unassignPermission(payload: { userId: number; apiId: number }) {
  return request("/permissions/unassign", { method: "POST", body: JSON.stringify(payload) });
}

export async function getWindows(subjectType: "user" | "api", subjectId: number) {
  return request<{ items: any[] }>(`/windows?subjectType=${subjectType}&subjectId=${subjectId}`);
}

export async function getPermissions(userId: number) {
  return request<{ items: number[] }>(`/permissions?userId=${userId}`);
}

export async function createWindow(payload: any) {
  return request("/windows", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateWindow(id: number, payload: any) {
  return request(`/windows/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function archiveWindow(id: number) {
  return request(`/windows/${id}/archive`, { method: "POST" });
}

function buildRangeQuery(range?: { from?: string; to?: string }) {
  if (!range?.from && !range?.to) {
    return "";
  }
  const params = new URLSearchParams();
  if (range.from) {
    params.set("from", range.from);
  }
  if (range.to) {
    params.set("to", range.to);
  }
  return `?${params.toString()}`;
}

export async function getOrgWeeklyReport(range?: { from?: string; to?: string }) {
  return request(`/reports/orgs/weekly${buildRangeQuery(range)}`);
}

export async function getOrgMonthlyReport(range?: { from?: string; to?: string }) {
  return request(`/reports/orgs/monthly${buildRangeQuery(range)}`);
}

export async function getUserWeeklyReport(range?: { from?: string; to?: string }) {
  return request(`/reports/users/weekly${buildRangeQuery(range)}`);
}

export async function getUserMonthlyReport(range?: { from?: string; to?: string }) {
  return request(`/reports/users/monthly${buildRangeQuery(range)}`);
}

export async function getLookups() {
  return request<{ roles: any[]; userStatuses: any[]; orgStatuses: any[] }>("/lookups");
}
