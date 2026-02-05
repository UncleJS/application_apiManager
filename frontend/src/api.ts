const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://localhost:55001";

export type ApiError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export function setToken(token: string) {
  localStorage.setItem("api-manager-token", token);
}

export function getToken(): string | null {
  return localStorage.getItem("api-manager-token");
}

export function clearToken() {
  localStorage.removeItem("api-manager-token");
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

export async function getOrgWeeklyReport() {
  return request("/reports/orgs/weekly");
}

export async function getOrgMonthlyReport() {
  return request("/reports/orgs/monthly");
}

export async function getUserWeeklyReport() {
  return request("/reports/users/weekly");
}

export async function getUserMonthlyReport() {
  return request("/reports/users/monthly");
}

export async function getLookups() {
  return request<{ roles: any[]; userStatuses: any[]; orgStatuses: any[] }>("/lookups");
}
