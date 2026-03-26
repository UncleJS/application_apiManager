import type { AuthUser } from "../middleware/authenticate";
import type { ErrorPayload } from "../utils/errors";

declare module "elysia" {
  interface SingletonBase {
    derive: SingletonBase["derive"] & {
      authUser: AuthUser | null;
      _authError: ErrorPayload | null;
    };
  }
}
