import type { RowDataPacket } from "mysql2/promise";
import { pool } from "./client";

export type QueryValue =
  | string
  | number
  | bigint
  | boolean
  | Date
  | null
  | Buffer
  | Uint8Array
  | QueryValue[]
  | { [key: string]: QueryValue };

export async function query<T = RowDataPacket[]>(sqlText: string, params: QueryValue[] = []): Promise<T> {
  const [rows] = await pool.execute(sqlText, params);
  return rows as T;
}
