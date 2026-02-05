import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { config, getJwtSecret } from "./config";

export type JwtPayload = {
  userId: number;
  role: string;
  organizationId: number;
};

const jwtSecret = getJwtSecret(config.jwt.secretPath);

export function signToken(payload: JwtPayload): string {
  const options: SignOptions = {
    expiresIn: config.jwt.expiresIn as SignOptions["expiresIn"]
  };
  return jwt.sign(payload, jwtSecret, options);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, jwtSecret) as JwtPayload;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
