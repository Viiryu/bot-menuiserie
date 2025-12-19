// part2/staff/staffState.js
// Drafts en mémoire : annonces + purge previews etc.
const _annDrafts = new Map();   // key guildId:userId
const _purgeDrafts = new Map(); // key guildId:userId
const _logViews = new Map();    // key guildId:userId (filter)

function key(guildId, userId) {
  return `${guildId}:${userId}`;
}

// ===== Annonce draft =====
function setAnnDraft(guildId, userId, draft) {
  _annDrafts.set(key(guildId, userId), draft);
  return draft;
}
function getAnnDraft(guildId, userId) {
  return _annDrafts.get(key(guildId, userId)) || null;
}
function patchAnnDraft(guildId, userId, patch) {
  const d = getAnnDraft(guildId, userId);
  if (!d) return null;
  const next = { ...d, ...patch, meta: { ...(d.meta || {}), updatedAt: Date.now() } };
  _annDrafts.set(key(guildId, userId), next);
  return next;
}
function clearAnnDraft(guildId, userId) {
  _annDrafts.delete(key(guildId, userId));
}

// ===== Purge draft =====
function setPurgeDraft(guildId, userId, draft) {
  _purgeDrafts.set(key(guildId, userId), draft);
  return draft;
}
function getPurgeDraft(guildId, userId) {
  return _purgeDrafts.get(key(guildId, userId)) || null;
}
function clearPurgeDraft(guildId, userId) {
  _purgeDrafts.delete(key(guildId, userId));
}

// ===== Log view =====
function setLogFilter(guildId, userId, filter) {
  _logViews.set(key(guildId, userId), filter);
}
function getLogFilter(guildId, userId) {
  return _logViews.get(key(guildId, userId)) || "all";
}

module.exports = {
  setAnnDraft,
  getAnnDraft,
  patchAnnDraft,
  clearAnnDraft,

  setPurgeDraft,
  getPurgeDraft,
  clearPurgeDraft,

  setLogFilter,
  getLogFilter,
};
