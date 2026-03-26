import { buildError } from "../utils/errors";
import type { AuthUser } from "./authenticate";

export function requireRole(roles: string[]) {
  return (authUser: AuthUser | null): { error: ReturnType<typeof buildError>; status: number } | null => {
    if (!authUser) {
      return { error: buildError("AUTH_REQUIRED", "Authorization required"), status: 401 };
    }
    if (!roles.includes(authUser.role)) {
      return { error: buildError("FORBIDDEN", "Insufficient permissions"), status: 403 };
    }
    return null;
  };
}
