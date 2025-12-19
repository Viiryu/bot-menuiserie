// part2/staff/staffConfigState.js
const fs = require("fs");
const path = require("path");

const STORE_PATH = path.join(__dirname, "staffConfig.json");

let _store = { version: 1, guilds: {} };

function loadStaffConfig() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      fs.writeFileSync(STORE_PATH, JSON.stringify(_store, null, 2), "utf8");
      return;
    }
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const json = JSON.parse(raw);
    if (json && json.guilds) _store = json;
  } catch (e) {
    console.error("[staffConfigState] load error:", e);
  }
}

function saveStaffConfig() {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(_store, null, 2), "utf8");
  } catch (e) {
    console.error("[staffConfigState] save error:", e);
  }
}

function getGuildConfig(guildId) {
  if (!_store.guilds[guildId]) {
    _store.guilds[guildId] = {
      logsChannelId: null,     // audit logs (recommandé)
      modLogsChannelId: null,  // logs modération (optionnel)
      announcePingRoleId: null, // rôle ping pour annonces "mention"
      maintenance: false,      // blocage actions sensibles
    };
    saveStaffConfig();
  }
  return _store.guilds[guildId];
}

function patchGuildConfig(guildId, patch) {
  const cfg = getGuildConfig(guildId);
  _store.guilds[guildId] = { ...cfg, ...patch };
  saveStaffConfig();
  return _store.guilds[guildId];
}

module.exports = {
  loadStaffConfig,
  saveStaffConfig,
  getGuildConfig,
  patchGuildConfig,
};
