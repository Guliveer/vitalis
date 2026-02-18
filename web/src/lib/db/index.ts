// Database client — lazy-loaded Neon serverless connection
// Persists across warm invocations for connection reuse

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Lazy-loaded database client optimized for serverless
// Uses Neon's HTTP driver (no persistent connections needed)
let _db: ReturnType<typeof createDb> | null = null;

function createDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql, { schema });
}

export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export type Database = ReturnType<typeof getDb>;
export { schema };
