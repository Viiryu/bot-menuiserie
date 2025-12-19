// part2/say/sayState.js
// Stockage en mémoire (draft par guildId + userId)
// Optionnel: tu peux persister plus tard en DB.

const _drafts = new Map(); // key = `${guildId}:${userId}` -> draft

function keyOf(guildId, userId) {
  return `${String(guildId)}:${String(userId)}`;
}

function setSayDraft(guildId, userId, draft) {
  if (!guildId || !userId) return null;
  const k = keyOf(guildId, userId);
  _drafts.set(k, draft);
  return draft;
}

function getSayDraft(guildId, userId) {
  if (!guildId || !userId) return null;
  return _drafts.get(keyOf(guildId, userId)) || null;
}

function patchSayDraft(guildId, userId, patch = {}) {
  const cur = getSayDraft(guildId, userId);
  if (!cur) return null;

  const next = { ...cur, ...patch };
  // Merge profond léger pour meta/text
  if (cur.meta || patch.meta) next.meta = { ...(cur.meta || {}), ...(patch.meta || {}) };
  if (cur.text || patch.text) next.text = { ...(cur.text || {}), ...(patch.text || {}) };

  setSayDraft(guildId, userId, next);
  return next;
}

function clearSayDraft(guildId, userId) {
  if (!guildId || !userId) return false;
  return _drafts.delete(keyOf(guildId, userId));
}

module.exports = {
  setSayDraft,
  getSayDraft,
  patchSayDraft,
  clearSayDraft,
};
