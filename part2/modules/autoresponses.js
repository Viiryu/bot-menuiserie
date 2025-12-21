/**
 * part2/modules/autoresponses.js
 *
 * Store JSON par guild.
 */

const fs = require("fs");
const path = require("path");

const STORE_PATH = path.join(__dirname, "autoresponsesStore.json");

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return { guilds: {} };
  }
}

function writeStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function list(guildId) {
  const st = readStore();
  return (st.guilds[guildId] || []).slice();
}

function add(guildId, trigger, response, actorUserId) {
  const st = readStore();
  st.guilds[guildId] = st.guilds[guildId] || [];

  // upsert par trigger
  const t = String(trigger).trim();
  const idx = st.guilds[guildId].findIndex((r) => r.trigger.toLowerCase() === t.toLowerCase());
  const entry = {
    trigger: t,
    response: String(response).trim(),
    updatedAt: new Date().toISOString(),
    updatedBy: actorUserId || null,
  };

  if (idx >= 0) st.guilds[guildId][idx] = entry;
  else st.guilds[guildId].push(entry);

  writeStore(st);
  return entry;
}

function remove(guildId, trigger) {
  const st = readStore();
  const list0 = st.guilds[guildId] || [];
  const t = String(trigger).trim().toLowerCase();
  const next = list0.filter((r) => String(r.trigger).trim().toLowerCase() !== t);
  st.guilds[guildId] = next;
  writeStore(st);
  return list0.length !== next.length;
}

function applyPlaceholders(text, message) {
  return String(text)
    .replaceAll("{user}", message.author.toString())
    .replaceAll("{username}", message.author.username)
    .replaceAll("{server}", message.guild?.name || "")
    .replaceAll("{channel}", message.channel?.toString?.() || "");
}

function registerAutoresponses(client) {
  client.on("messageCreate", async (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      const rules = list(message.guild.id);
      if (!rules.length) return;

      const content = (message.content || "").toLowerCase();
      const match = rules.find((r) => content.includes(String(r.trigger).toLowerCase()));
      if (!match) return;

      const out = applyPlaceholders(match.response, message);
      if (!out.trim()) return;
      await message.reply({ content: out }).catch(() => {});
    } catch {}
  });
}

module.exports = {
  list,
  add,
  remove,
  registerAutoresponses,
};
