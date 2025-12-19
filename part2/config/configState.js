// part2/config/configState.js
// Stockage simple de config par guild (channels de logs, annonces, etc.)

const fs = require("fs");
const path = require("path");

const STORE_PATH = path.join(__dirname, "configStore.json");

let _store = { version: 1, guilds: {} };

function loadConfigFromDisk() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      fs.writeFileSync(STORE_PATH, JSON.stringify(_store, null, 2), "utf8");
      return;
    }
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const json = JSON.parse(raw);
    if (json && typeof json === "object") {
      _store = {
        version: json.version || 1,
        guilds: json.guilds && typeof json.guilds === "object" ? json.guilds : {},
      };
    }
  } catch (e) {
    console.error("[configState] load error:", e);
  }
}

function saveConfigToDisk() {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(_store, null, 2), "utf8");
  } catch (e) {
    console.error("[configState] save error:", e);
  }
}

function _g(guildId) {
  if (!_store.guilds[guildId]) _store.guilds[guildId] = {};
  return _store.guilds[guildId];
}

function getGuildConfig(guildId) {
  return { ...( _store.guilds[guildId] || {} ) };
}

function getConfig(guildId, key, fallback = null) {
  const g = _store.guilds[guildId];
  if (!g) return fallback;
  return g[key] ?? fallback;
}

function setConfig(guildId, key, value) {
  const g = _g(guildId);
  if (value === undefined) return g[key] ?? null;

  if (value === null) delete g[key];
  else g[key] = value;

  saveConfigToDisk();
  return g[key] ?? null;
}

module.exports = {
  loadConfigFromDisk,
  saveConfigToDisk,
  getGuildConfig,
  getConfig,
  setConfig,
};
