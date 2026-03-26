const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://localhost:55001";

export type ApiError = { message: string; code?: string };

export class RequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "RequestError";
    this.status = status;
    this.code = code;
  }
}

export type User = {
  id: number;
  username: string;
  role: string;
  role_name: string;
  organization_id: number;
  organization_name: string;
  status_name: string;
  status_id: number;
};

export type Org = {
  id: number;
  name: string;
  status_name: string;
  status_id: number;
};

export type ApiRecord = {
  id: number;
  name: string;
  base_path: string;
  target_url: string;
  is_public: boolean;
  is_enabled: boolean;
  always_on: boolean;
  organization_id: number;
  organization_name: string;
  status_name: string;
};

export type Window = {
  id: number;
  subject_type: string;
  subject_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

export type Session = {
  id: number;
  user_id: number;
  username: string;
  organization_id: number;
  organization_name: string;
  user_agent: string | null;
  client_ip: string | null;
  created_at_utc: string;
  last_activity_utc: string;
  expires_at_utc: string;
  revoked_at_utc: string | null;
  status?: string;
};

export type Lookups = {
  roles: { id: number; name: string }[];
  userStatuses: { id: number; name: string }[];
  orgStatuses: { id: number; name: string }[];
};

export type ReportRow = {
  organization_id?: number;
  organization_name?: string;
  user_id?: number;
  username?: string;
  week_label?: string;
  month_label?: string;
  allowed_count: number;
  denied_count: number;
  total_count: number;
  request_bytes_total: number;
  response_bytes_total: number;
  response_header_bytes_total: number;
  total_bytes_total: number;
};

export type ReportResult = {
  range: { start: string; end: string };
  items: ReportRow[];
  totals: ReportRow;
};

async function request<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401) {
    let message = "Unauthorized";
    let code: string | undefined;
    try {
      const body = await res.json();
      message = body?.message ?? message;
      code = body?.code;
    } catch {}

    if (typeof window !== "undefined") {
      if (code === "AUTH_REQUIRED" || code === "INVALID_TOKEN" || code === "SESSION_EXPIRED") {
        window.dispatchEvent(new Event("auth:required"));
      }
    }
    throw new RequestError(message, 401, code ?? "AUTH_REQUIRED");
  }

  if (!res.ok) {
    let msg = res.statusText;
    let code: string | undefined;
    try {
      const body = await res.json();
      msg = body?.message ?? msg;
      code = body?.code;
    } catch {}
    throw new RequestError(msg, res.status, code);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

// Auth
export async function login(username: string, password: string) {
  return request<{ ok: true }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function getMe() {
  return request<{ user: User }>("/auth/me");
}

export async function logout() {
  return request("/auth/logout", { method: "POST" });
}

// Orgs
export async function getOrgs() {
  return request<{ items: Org[] }>("/orgs");
}

export async function createOrg(data: { name: string }) {
  return request<Org>("/orgs", { method: "POST", body: JSON.stringify(data) });
}

export async function updateOrg(id: number, data: { name?: string; statusId?: number }) {
  return request<Org>(`/orgs/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function archiveOrg(id: number) {
  return request(`/orgs/${id}/archive`, { method: "POST" });
}

// Users
export async function getUsers() {
  return request<{ items: User[] }>("/users");
}

export async function createUser(data: {
  username: string;
  password: string;
  organizationId: number;
  roleId: number;
}) {
  return request<User>("/users", { method: "POST", body: JSON.stringify(data) });
}

export async function updateUser(
  id: number,
  data: {
    username?: string;
    password?: string;
    organizationId?: number;
    roleId?: number;
    statusId?: number;
  }
) {
  return request<User>(`/users/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function archiveUser(id: number) {
  return request(`/users/${id}/archive`, { method: "POST" });
}

// APIs
export async function getApis() {
  return request<{ items: ApiRecord[] }>("/apis");
}

export async function createApi(data: {
  organizationId: number;
  name: string;
  basePath: string;
  targetUrl: string;
  isPublic: boolean;
  isEnabled?: boolean;
  alwaysOn?: boolean;
}) {
  return request<ApiRecord>("/apis", { method: "POST", body: JSON.stringify(data) });
}

export async function updateApi(
  id: number,
  data: {
    name?: string;
    basePath?: string;
    targetUrl?: string;
    isPublic?: boolean;
    isEnabled?: boolean;
    alwaysOn?: boolean;
    organizationId?: number;
  }
) {
  return request<ApiRecord>(`/apis/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function archiveApi(id: number) {
  return request(`/apis/${id}/archive`, { method: "POST" });
}

// Permissions
export async function getPermissions(userId: number) {
  return request<{ items: number[] }>(`/permissions?userId=${userId}`);
}

export async function assignPermission(data: { userId: number; apiId: number }) {
  return request("/permissions/assign", { method: "POST", body: JSON.stringify(data) });
}

export async function unassignPermission(data: { userId: number; apiId: number }) {
  return request("/permissions/unassign", { method: "POST", body: JSON.stringify(data) });
}

// Windows
export async function getWindows(subjectType: "user" | "api", subjectId: number) {
  return request<{ items: Window[] }>(
    `/windows?subjectType=${subjectType}&subjectId=${subjectId}`
  );
}

export async function createWindow(data: {
  subjectType: string;
  subjectId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}) {
  return request<Window>("/windows", { method: "POST", body: JSON.stringify(data) });
}

export async function updateWindow(
  id: number,
  data: { dayOfWeek?: number; startTime?: string; endTime?: string; isActive?: boolean }
) {
  return request<Window>(`/windows/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function archiveWindow(id: number) {
  return request(`/windows/${id}/archive`, { method: "POST" });
}

// Lookups
export async function getLookups() {
  return request<Lookups>("/lookups");
}

// Reports
function buildRangeQuery(range?: { from?: string; to?: string }): string {
  if (!range) return "";
  const p = new URLSearchParams();
  if (range.from) p.set("from", range.from);
  if (range.to) p.set("to", range.to);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export async function getOrgWeeklyReport(range?: { from?: string; to?: string }) {
  return request<ReportResult>(`/reports/orgs/weekly${buildRangeQuery(range)}`);
}

export async function getOrgMonthlyReport(range?: { from?: string; to?: string }) {
  return request<ReportResult>(`/reports/orgs/monthly${buildRangeQuery(range)}`);
}

export async function getUserWeeklyReport(range?: { from?: string; to?: string }) {
  return request<ReportResult>(`/reports/users/weekly${buildRangeQuery(range)}`);
}

export async function getUserMonthlyReport(range?: { from?: string; to?: string }) {
  return request<ReportResult>(`/reports/users/monthly${buildRangeQuery(range)}`);
}

// Sessions
export async function getSessions(opts?: { userId?: number; orgId?: number }) {
  const p = new URLSearchParams();
  if (opts?.userId) p.set("userId", String(opts.userId));
  if (opts?.orgId) p.set("orgId", String(opts.orgId));
  const s = p.toString();
  return request<{ items: Session[] }>(`/sessions${s ? `?${s}` : ""}`);
}

export async function revokeSession(sessionId: number) {
  return request(`/sessions/${sessionId}/revoke`, { method: "POST" });
}
