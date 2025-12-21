// part2/say/sayState.js

// Simple in-memory pending drafts for /say.
// Keyed by guildId + userId to avoid collisions.

const PENDING = new Map();
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

function _key(guildId, userId) {
  return `${guildId || 'DM'}:${userId}`;
}

function setPendingSay(guildId, userId, data, ttlMs = DEFAULT_TTL_MS) {
  const expiresAt = Date.now() + ttlMs;
  PENDING.set(_key(guildId, userId), { ...data, expiresAt });
}

function getPendingSay(guildId, userId) {
  const k = _key(guildId, userId);
  const v = PENDING.get(k);
  if (!v) return null;
  if (v.expiresAt && v.expiresAt < Date.now()) {
    PENDING.delete(k);
    return null;
  }
  return v;
}

function clearPendingSay(guildId, userId) {
  PENDING.delete(_key(guildId, userId));
}

module.exports = { setPendingSay, getPendingSay, clearPendingSay };
