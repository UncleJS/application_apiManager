import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const DEFAULT_CERT_PATH = "/data/tls/cert.pem";
const DEFAULT_KEY_PATH = "/data/tls/key.pem";
const DEFAULT_JWT_SECRET_PATH = "/data/jwt/secret";

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function generateJwtSecret(secretPath: string): string {
  ensureDir(secretPath);
  const secret = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(secretPath, secret, { encoding: "utf-8", mode: 0o600 });
  return secret;
}

export function getJwtSecret(secretPath: string): string {
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, "utf-8").trim();
  }
  return generateJwtSecret(secretPath);
}

export function ensureTls(certPath: string, keyPath: string): void {
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return;
  }

  ensureDir(certPath);
  ensureDir(keyPath);

  const result = spawnSync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-subj",
    "/CN=api-manager",
    "-days",
    "3650"
  ]);

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || "unknown error";
    throw new Error(`Failed to generate TLS certs: ${stderr}`);
  }
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
  jwt: {
    secretPath: process.env.JWT_SECRET_PATH ?? DEFAULT_JWT_SECRET_PATH,
    expiresIn: process.env.JWT_EXPIRES_IN ?? "12h"
  },
  tls: {
    certPath: process.env.TLS_CERT_PATH ?? DEFAULT_CERT_PATH,
    keyPath: process.env.TLS_KEY_PATH ?? DEFAULT_KEY_PATH
  },
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:55000",
  seedData: process.env.SEED_DATA === "true",
  seedAccessLogs: process.env.SEED_ACCESS_LOGS === "true",
  bootstrapAdmin: process.env.BOOTSTRAP_ADMIN !== "false",
  bootstrapPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "001002..Ad",
  sessionIdleSeconds: Number.parseInt(process.env.SESSION_IDLE_SECONDS ?? "3600", 10),
  sessionHardMaxSeconds: Number.parseInt(process.env.SESSION_HARD_MAX_SECONDS ?? "10800", 10)
};
