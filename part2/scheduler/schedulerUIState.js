const SESSIONS = new Map(); // userId -> { guildId, selectedId, at }

function setSession(userId, guildId, selectedId) {
  SESSIONS.set(userId, { guildId, selectedId: Number(selectedId) || null, at: Date.now() });
}

function getSession(userId) {
  return SESSIONS.get(userId) || null;
}

function clearSession(userId) {
  SESSIONS.delete(userId);
}

// cleanup (15 min)
setInterval(() => {
  const now = Date.now();
  for (const [uid, s] of SESSIONS) {
    if (now - (s.at || 0) > 15 * 60 * 1000) SESSIONS.delete(uid);
  }
}, 60_000).unref?.();

module.exports = { setSession, getSession, clearSession };
