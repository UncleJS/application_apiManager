import bcrypt from "bcryptjs";

// Cost factor 12 is the modern baseline (2024+). bcrypt.compare reads the cost
// from each stored hash, so existing cost-10 hashes keep verifying after this bump.
const BCRYPT_COST = 12;

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(BCRYPT_COST);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let dummyPasswordHash: string | null = null;

/** Runs a real bcrypt compare when the account does not exist, so login timing stays even. */
export async function verifyAgainstDummy(password: string): Promise<void> {
  if (!dummyPasswordHash) {
    dummyPasswordHash = await hashPassword("timing-pad");
  }
  await verifyPassword(password, dummyPasswordHash);
}
