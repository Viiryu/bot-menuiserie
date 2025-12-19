// part2/moderation/warnState.js
// Stockage persistant des warns (par guild).

const fs = require("fs");
const path = require("path");

const STORE_PATH = path.join(__dirname, "warnStore.json");

let _store = { version: 1, guilds: {} };

function loadWarnsFromDisk() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      fs.writeFileSync(STORE_PATH, JSON.stringify(_store, null, 2), "utf8");
      return;
    }
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const json = JSON.parse(raw);
    if (json && typeof json === "object") {
      _store = { version: json.version || 1, guilds: json.guilds || {} };
    }
  } catch (e) {
    console.error("[warnState] load error:", e);
  }
}

function saveWarnsToDisk() {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(_store, null, 2), "utf8");
  } catch (e) {
    console.error("[warnState] save error:", e);
  }
}

function _g(guildId) {
  if (!_store.guilds[guildId]) _store.guilds[guildId] = { users: {} };
  if (!_store.guilds[guildId].users) _store.guilds[guildId].users = {};
  return _store.guilds[guildId];
}

function listWarns(guildId, userId) {
  const g = _store.guilds[guildId];
  const u = g?.users?.[userId];
  return Array.isArray(u) ? u : [];
}

function addWarn(guildId, userId, warn) {
  const g = _g(guildId);
  if (!Array.isArray(g.users[userId])) g.users[userId] = [];
  g.users[userId].push(warn);
  saveWarnsToDisk();
  return g.users[userId];
}

function removeWarn(guildId, userId, index1based) {
  const g = _store.guilds[guildId];
  if (!g?.users?.[userId]) return null;
  const arr = g.users[userId];
  const idx = Number(index1based) - 1;
  if (!Number.isFinite(idx) || idx < 0 || idx >= arr.length) return null;
  const [removed] = arr.splice(idx, 1);
  saveWarnsToDisk();
  return removed;
}

function clearWarns(guildId, userId) {
  const g = _store.guilds[guildId];
  if (!g?.users?.[userId]) return 0;
  const n = g.users[userId].length;
  delete g.users[userId];
  saveWarnsToDisk();
  return n;
}

module.exports = {
  loadWarnsFromDisk,
  addWarn,
  listWarns,
  removeWarn,
  clearWarns,
};
