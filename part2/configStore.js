const { q, hasDb } = require("./db");
const {
  DEFAULT_STAFF_ROLE_IDS,
  DEFAULT_COMPTA_ROLE_IDS,
  DEFAULT_AUTOROLE_NAME,
} = require("./constants");

let cache = null;
let cacheAt = 0;
const CACHE_MS = 30_000; // 30 secondes

async function getConfig() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_MS) return cache;

  // On lit la config depuis Postgres si dispo, sinon on prend juste les defaults
  let fromDb = {};
  if (hasDb()) {
    try {
      const res = await q("SELECT value FROM part2_kv WHERE key='config' LIMIT 1");
      fromDb = res.rows?.[0]?.value ?? {};
    } catch (e) {
      // DB down / pas initialisée -> on ignore et on prend les valeurs par défaut
      fromDb = {};
    }
  }

  // Valeurs par défaut (si pas encore configuré)
  const merged = {
    logsChannelId: process.env.LOGS_CHANNEL_ID || null,
    welcomeChannelId: null,
    autoroleName: DEFAULT_AUTOROLE_NAME,

    staffRoleIds: DEFAULT_STAFF_ROLE_IDS,
    comptaRoleIds: DEFAULT_COMPTA_ROLE_IDS,

    automod: {
      enabled: true,
      spam: { maxMessages: 6, perSeconds: 4 },
      action: { type: "timeout", durationSeconds: 30 },
      blockInvites: true,
      maxMentions: 5,
      whitelist: { channelIds: [], roleIds: [] },
    },

    ...fromDb,
  };

  // sécurité : si DB contient un truc incomplet
  merged.staffRoleIds = merged.staffRoleIds || DEFAULT_STAFF_ROLE_IDS;
  merged.comptaRoleIds = merged.comptaRoleIds || DEFAULT_COMPTA_ROLE_IDS;
  merged.automod = merged.automod || {};
  merged.automod.whitelist = merged.automod.whitelist || { channelIds: [], roleIds: [] };

  cache = merged;
  cacheAt = now;
  return merged;
}

async function setConfig(nextCfg) {
  // Si pas de DB, on ne peut pas persister -> on met juste en cache
  if (!hasDb()) {
    cache = nextCfg;
    cacheAt = Date.now();
    return;
  }

  await q(
    `INSERT INTO part2_kv(key,value)
     VALUES('config',$1)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
    [nextCfg]
  );

  cache = nextCfg;
  cacheAt = Date.now();
}

function clearConfigCache() {
  cache = null;
  cacheAt = 0;
}

module.exports = { getConfig, setConfig, clearConfigCache };
