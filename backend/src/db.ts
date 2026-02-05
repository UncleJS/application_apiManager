import mariadb from "mariadb";
import { config } from "./config";

export const pool = mariadb.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  connectionLimit: 10
});

export async function query<T = any>(sql: string, params: any[] = []): Promise<T> {
  const connection = await pool.getConnection();
  try {
    return await connection.query(sql, params);
  } finally {
    connection.release();
  }
}

export async function withConnection<T>(
  fn: (connection: mariadb.PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    return await fn(connection);
  } finally {
    connection.release();
  }
}
