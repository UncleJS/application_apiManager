import type { User } from "@/lib/api";
import { normalizeRole } from "@/lib/utils";

export type MePayload = {
  id: number | string;
  role?: string;
  role_name?: string;
  role_id?: number | string;
  organizationId?: number | string;
  organization_id?: number | string;
  username?: string;
  organization_name?: string;
  status_name?: string;
  status_id?: number | string;
};

function asId(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeUser(user: MePayload): User {
  const role = normalizeRole(user.role ?? user.role_name);
  return {
    id: asId(user.id),
    username: user.username ?? "",
    role,
    role_id: user.role_id === undefined ? undefined : asId(user.role_id),
    role_name: user.role_name ?? role,
    organization_id: asId(user.organization_id ?? user.organizationId),
    organization_name: user.organization_name ?? "",
    status_name: user.status_name ?? "",
    status_id: asId(user.status_id),
  };
}
