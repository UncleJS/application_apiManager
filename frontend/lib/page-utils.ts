import { RequestError } from "@/lib/api";

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof RequestError || error instanceof Error) {
    return error.message;
  }

  return fallback;
}
