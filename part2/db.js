// part2/db.js — DB optional (no crash without pg)
// If DATABASE_URL is set, we'll try to use Postgres via 'pg'.
// Otherwise we fall back to a tiny in-memory/no-op driver so the bot runs everywhere.

"use strict";

let _pool = null;

function hasDatabaseUrl() {
  return !!process.env.DATABASE_URL;
}

function getPgPool() {
  if (_pool) return _pool;

  let Pool;
  try {
    ({ Pool } = require("pg"));
  } catch (e) {
    // pg not installed -> cannot use DB mode
    throw new Error(
      "Module 'pg' manquant. Installe-le (npm i pg) OU retire DATABASE_URL de l'env."
    );
  }

  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      String(process.env.PGSSL || "true").toLowerCase() === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  });

  return _pool;
}

/**
 * query(sql, params)
 * - In DB mode (DATABASE_URL): executes SQL
 * - Otherwise: returns empty rows
 */
async function query(sql, params = []) {
  if (!hasDatabaseUrl()) {
    return { rows: [], rowCount: 0 };
  }

  const pool = getPgPool();
  const res = await pool.query(sql, params);
  return res;
}

async function close() {
  try {
    if (_pool) await _pool.end();
  } catch {}
  _pool = null;
}

module.exports = { query, close, hasDatabaseUrl };
