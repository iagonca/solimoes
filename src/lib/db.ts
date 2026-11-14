import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { Pool, types, type QueryResultRow } from "pg";

// date volta como texto 'AAAA-MM-DD' (sem fuso); numeric e bigint como number.
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => parseInt(v, 10));

// Pool único por instância. Na Vercel (Fluid compute), attachDatabasePool
// fecha as conexões ociosas antes de a instância ser suspensa.
const globalForPool = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPool.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL, // conexão com pooler
    max: 10,          // a visão geral dispara ~8 consultas em paralelo
    idleTimeoutMillis: 10_000,
  });

if (!globalForPool.pgPool) {
  globalForPool.pgPool = pool;
  attachDatabasePool(pool);
}

export async function sql<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await pool.query<T>(text, params);
  return rows;
}

export async function sqlOne<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await sql<T>(text, params);
  return rows[0] ?? null;
}
