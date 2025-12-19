const fs = require("fs");
const path = require("path");

const STORE_PATH = path.join(__dirname, "autoroleStore.json");

let _store = { version: 1, items: [] };

function loadAutorolesFromDisk() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      fs.writeFileSync(STORE_PATH, JSON.stringify(_store, null, 2), "utf8");
      return;
    }
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const json = JSON.parse(raw);
    if (json && Array.isArray(json.items)) _store = json;
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

function addAutoroleMenu(menu) {
  // menu: { guildId, channelId, messageId, roleIds:[], multi:boolean, createdAt }
  _store.items = _store.items.filter((x) => x.messageId !== menu.messageId);
  _store.items.push(menu);
  saveAutorolesToDisk();
}

function removeAutoroleMenu(messageId) {
  const before = _store.items.length;
  _store.items = _store.items.filter((x) => x.messageId !== messageId);
  const removed = before - _store.items.length;
  if (removed) saveAutorolesToDisk();
  return removed;
}

function getAutoroleMenu(messageId) {
  return _store.items.find((x) => x.messageId === messageId) || null;
}

function listAutoroleMenus(guildId) {
  return _store.items.filter((x) => x.guildId === guildId);
}

module.exports = {
  loadAutorolesFromDisk,
  addAutoroleMenu,
  removeAutoroleMenu,
  getAutoroleMenu,
  listAutoroleMenus,
};
