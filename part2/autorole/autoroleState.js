// part2/autorole/autoroleState.js
const fs = require("fs");
const path = require("path");

const STORE_PATH = path.join(__dirname, "autoroleStore.json");

// v2 : settings + comportement
let _store = { version: 2, items: [] };

// Drafts (wizard) en mémoire uniquement
const _drafts = new Map(); // key: `${guildId}:${userId}`

function _key(guildId, userId) {
  return `${guildId}:${userId}`;
}

function loadAutorolesFromDisk() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      fs.writeFileSync(STORE_PATH, JSON.stringify(_store, null, 2), "utf8");
      return;
    }
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const json = JSON.parse(raw);
    if (json && Array.isArray(json.items)) {
      _store = { version: Number(json.version || 2), items: json.items };
      if (_store.version !== 2) _store.version = 2;
    }
  } catch (e) {
    console.error("[autoroleState] load error:", e);
  }
}

function saveAutorolesToDisk() {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(_store, null, 2), "utf8");
  } catch (e) {
    console.error("[autoroleState] save error:", e);
  }
}

/**
 * config/menu:
 * {
 *  guildId, channelId, messageId,
 *  roleIds: [],
 *  mode: "toggle"|"add",
 *  multi: boolean,
 *  remplacement: boolean,
 *  temporary: boolean,
 *  durationMs: number,
 *  title, description, placeholder, color, footer,
 *  createdBy, createdAt
 * }
 */
function upsertAutoroleMessage(guildId, messageId, config) {
  _store.items = _store.items.filter((x) => !(x.guildId === guildId && x.messageId === messageId));
  _store.items.push({ ...config, guildId, messageId });
  saveAutorolesToDisk();
}

function removeAutoroleMessage(guildId, messageId) {
  const before = _store.items.length;
  _store.items = _store.items.filter((x) => !(x.guildId === guildId && x.messageId === messageId));
  const removed = before - _store.items.length;
  if (removed) saveAutorolesToDisk();
  return removed;
}

function getAutoroleMessage(guildId, messageId) {
  return _store.items.find((x) => x.guildId === guildId && x.messageId === messageId) || null;
}

function listAutoroleMessages(guildId) {
  return _store.items.filter((x) => x.guildId === guildId);
}

// ========================== Drafts (Wizard) ==========================

function setPending(guildId, userId, draft) {
  _drafts.set(_key(guildId, userId), draft);
  return draft;
}

function getPending(guildId, userId) {
  return _drafts.get(_key(guildId, userId)) || null;
}

function patchPending(guildId, userId, patch) {
  const d = getPending(guildId, userId);
  if (!d) return null;
  const next = {
    ...d,
    ...patch,
    meta: { ...(d.meta || {}), updatedAt: Date.now() },
  };
  _drafts.set(_key(guildId, userId), next);
  return next;
}

function clearPending(guildId, userId) {
  _drafts.delete(_key(guildId, userId));
}

module.exports = {
  loadAutorolesFromDisk,
  saveAutorolesToDisk,

  upsertAutoroleMessage,
  removeAutoroleMessage,
  getAutoroleMessage,
  listAutoroleMessages,

  setPending,
  getPending,
  patchPending,
  clearPending,
};
