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
  // Non-null by construction: the authenticate derive always pairs a null
  // authUser with a populated _authError, and handlers only ever return
  // _authError inside their `if (!authUser)` branch.
  _authError: ErrorPayload;
  set: ResponseSet;
  headers: HeaderMap;
};

export type PublicContext<TBody = unknown> = {
  body: TBody;
  set: ResponseSet;
  headers: HeaderMap;
};
