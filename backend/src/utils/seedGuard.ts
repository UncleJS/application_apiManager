const BLOCKED_SEED_PASSWORDS = new Set([
  "",
  "010203!@",
  "change_me",
  "change_this_to_a_unique_strong_password",
  "change_this_for_seeded_users"
]);

export function assertSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === "production" && env.ALLOW_SEED !== "true") {
    throw new Error("Refusing to seed when NODE_ENV=production");
  }
}

export function assertSeedPassword(env: NodeJS.ProcessEnv = process.env): string {
  assertSeedAllowed(env);
  const password = env.SEED_USER_PASSWORD?.trim() || env.BOOTSTRAP_ADMIN_PASSWORD?.trim() || "";
  if (BLOCKED_SEED_PASSWORDS.has(password)) {
    throw new Error("SEED_USER_PASSWORD must be set to a non-default value");
  }
  return password;
}
