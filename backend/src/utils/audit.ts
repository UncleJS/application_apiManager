export function sanitizeAuditMetadata(metadata?: Record<string, unknown>): Record<string, unknown> {
  if (!metadata) {
    return {};
  }

  const sanitized = { ...metadata };
  for (const key of Object.keys(sanitized)) {
    if (key.toLowerCase().includes("password")) {
      sanitized[key] = "[REDACTED]";
    }
  }

  return sanitized;
}
