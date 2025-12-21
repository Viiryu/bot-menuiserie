// part2/config/configStore.js
const fs = require("fs");
const path = require("path");

const STORE_PATH = path.join(__dirname, "configStore.json");

// Structure: { version: 1, guilds: { [guildId]: { ...settings } } }
let _store = { version: 1, guilds: {} };

function _ensureDefaults(guildId) {
  if (!_store.guilds[guildId]) _store.guilds[guildId] = {};
  const g = _store.guilds[guildId];

  // Channels
  g.logChannelId = g.logChannelId || "";
  g.ticketCategoryId = g.ticketCategoryId || "";
  g.ticketLogsChannelId = g.ticketLogsChannelId || "";
  g.applicationReviewChannelId = g.applicationReviewChannelId || "";
  g.suggestionsChannelId = g.suggestionsChannelId || "";
  g.welcomeChannelId = g.welcomeChannelId || "";
  g.leaveChannelId = g.leaveChannelId || "";

  // Roles
  g.staffRoleIds = Array.isArray(g.staffRoleIds) ? g.staffRoleIds : [];

  // Tickets
  g.ticketNamePrefix = g.ticketNamePrefix || "ticket";
  g.ticketAutoCloseOnDelete = g.ticketAutoCloseOnDelete !== false; // default true

  // Applications
  g.applicationApprovedRoleId = g.applicationApprovedRoleId || "";
  g.applicationDMOnDecision = g.applicationDMOnDecision !== false; // default true

  // Welcome/Leave templates (supports {user} {server} {memberCount})
  g.welcomeTemplate =
    g.welcomeTemplate ||
    "👋 Bienvenue {user} sur **{server}** !\nVous êtes maintenant **#{memberCount}**.";
  g.leaveTemplate =
    g.leaveTemplate ||
    "👋 {user} a quitté **{server}**.\nMembres restants : **{memberCount}**.";

  return g;
}

function loadConfigFromDisk() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      fs.writeFileSync(STORE_PATH, JSON.stringify(_store, null, 2), "utf8");
      return;
    }
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const json = JSON.parse(raw);
    if (json && typeof json === "object") _store = json;
  } catch (e) {
    console.error("[configStore] load error:", e);
  }
}

function saveConfigToDisk() {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(_store, null, 2), "utf8");
  } catch (e) {
    console.error("[configStore] save error:", e);
  }
}

function getGuildConfig(guildId) {
  if (!guildId) return {};
  return _ensureDefaults(guildId);
}

function patchGuildConfig(guildId, patch) {
  const cur = getGuildConfig(guildId);
  const next = { ...cur, ...(patch || {}) };
  _store.guilds[guildId] = next;
  saveConfigToDisk();
  return next;
}

module.exports = {
  loadConfigFromDisk,
  saveConfigToDisk,
  getGuildConfig,
  patchGuildConfig,
};
