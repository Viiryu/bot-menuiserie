// part2/db.js
// ✅ Ne casse pas le bot si "pg" ou DATABASE_URL n'existent pas.

let Pool = null;
try {
  ({ Pool } = require('pg'));
} catch {
  Pool = null;
}

const DATABASE_URL = process.env.DATABASE_URL || process.env.PG_URL || '';
const ENABLED = Boolean(Pool && DATABASE_URL);

let pool = null;
if (ENABLED) {
  pool = new Pool({ connectionString: DATABASE_URL });
}

async function query(text, params) {
  if (!pool) return { rows: [], rowCount: 0 };
  return pool.query(text, params);
}

async function end() {
  if (!pool) return;
  await pool.end().catch(() => {});
}

module.exports = {
  ENABLED,
  pool,
  query,
  end,
};
