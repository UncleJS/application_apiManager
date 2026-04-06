function resolveBootstrapPassword(): string {
  const configured = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
  if (process.env.BOOTSTRAP_ADMIN === "false") {
    return "";
  }

  if (!configured || configured === "010203!@" || configured === "change_me") {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be set to a non-default value when bootstrap admin is enabled");
  }

  return configured;
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  host: process.env.HOST ?? "0.0.0.0",
  port: Number.parseInt(process.env.PORT ?? "55001", 10),
  db: {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number.parseInt(process.env.DB_PORT ?? "3306", 10),
    user: process.env.DB_USER ?? "api_manager",
    password: process.env.DB_PASSWORD ?? "api_manager_password",
    database: process.env.DB_DATABASE ?? "api_manager"
  },
  corsOrigin: process.env.CORS_ORIGIN ?? "https://localhost:55000",
  seedData: process.env.SEED_DATA === "true",
  seedAccessLogs: process.env.SEED_ACCESS_LOGS === "true",
  bootstrapAdmin: process.env.BOOTSTRAP_ADMIN !== "false",
  bootstrapPassword: resolveBootstrapPassword(),
  sessionIdleSeconds: Number.parseInt(process.env.SESSION_IDLE_SECONDS ?? "3600", 10),
  sessionHardMaxSeconds: Number.parseInt(process.env.SESSION_HARD_MAX_SECONDS ?? "10800", 10),
  proxyMaxRequestBytes: Number.parseInt(process.env.PROXY_MAX_REQUEST_BYTES ?? "10485760", 10),
  proxyMaxResponseBytes: Number.parseInt(process.env.PROXY_MAX_RESPONSE_BYTES ?? "10485760", 10)
};
