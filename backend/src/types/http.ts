import type { AuthUser } from "../middleware/authenticate";
import type { ErrorPayload } from "../utils/errors";

export type ResponseSet = {
  status?: number | string;
  headers: Record<string, string | number>;
};

export type HeaderMap = Record<string, string | string[] | undefined>;

export type ProtectedContext<
  TQuery extends Record<string, unknown> = Record<string, unknown>,
  TBody = unknown,
  TParams extends Record<string, string> = Record<string, string>
> = {
  query: TQuery;
  body: TBody;
  params: TParams;
  authUser: AuthUser | null;
  _authError: ErrorPayload | null;
  set: ResponseSet;
  headers: HeaderMap;
};

export type PublicContext<TBody = unknown> = {
  body: TBody;
  set: ResponseSet;
  headers: HeaderMap;
};
