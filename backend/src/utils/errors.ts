export type ErrorPayload = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export function buildError(code: string, message: string, details: Record<string, unknown> = {}): ErrorPayload {
  return { code, message, details };
}
