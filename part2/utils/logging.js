// part2/utils/logging.js
const { EmbedBuilder } = require("discord.js");
const { getGuildConfig } = require("../config/configStore");

const LEVEL = {
  info: { color: 0x2ecc71, icon: "✅" },
  warn: { color: 0xf1c40f, icon: "⚠️" },
  error: { color: 0xe74c3c, icon: "❌" },
};

function clamp(s, n) {
  const str = String(s ?? "");
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

async function resolveLogChannel(client, guildId) {
  const cfg = getGuildConfig(guildId);
  const id = cfg.logChannelId || process.env.LOGS_CHANNEL_ID || "";
  if (!id) return null;
  try {
    const ch = await client.channels.fetch(id);
    if (ch?.isTextBased?.()) return ch;
  } catch {}
  return null;
}

async function logEvent(client, guildId, level, source, action, message, meta = {}) {
  try {
    console.log(`[${String(level).toUpperCase()}] ${source} • ${action} ${message}`);

    if (!client?.isReady?.()) return;
    const ch = await resolveLogChannel(client, guildId);
    if (!ch) return;

    const theme = LEVEL[level] || LEVEL.info;

    const embed = new EmbedBuilder()
      .setColor(theme.color)
      .setTitle(`${theme.icon} ${source}`)
      .setDescription(`**${action}**\n${clamp(message, 3800)}`)
      .setTimestamp(new Date());

    const fields = [];
    for (const [k, v] of Object.entries(meta || {})) {
      if (v === undefined || v === null || String(v).trim() === "") continue;
      fields.push({ name: String(k).slice(0, 256), value: String(v).slice(0, 1024), inline: true });
    }
    if (fields.length) embed.addFields(fields.slice(0, 24));

    await ch.send({ embeds: [embed] }).catch(() => {});
  } catch (e) {
    console.error("[part2/logEvent] failed:", e?.message || e);
  }
}

module.exports = { logEvent };
