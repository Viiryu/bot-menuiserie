const { Pool } = require("pg");

let pool;

function hasDb() {
  return !!process.env.DATABASE_URL;
}

function getPool() {
  if (!hasDb()) return null;
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

async function q(text, params) {
  const p = getPool();
  if (!p) {
    throw new Error("NO_DB");
  }
  return p.query(text, params);
}

module.exports = { q, hasDb };
