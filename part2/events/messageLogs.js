/**
 * part2/events/messageLogs.js (NO-DB)
 *
 * Logs premium (message delete/edit) vers le salon défini dans la config part2.
 */

const { EmbedBuilder } = require("discord.js");
const { getGuildConfig } = require("../config/configStore");

function clamp(s, n) {
  const str = String(s ?? "");
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

async function resolveLogChannel(client, guildId) {
  try {
    const cfg = getGuildConfig(guildId);
    const channelId = cfg?.logsChannelId;
    if (!channelId) return null;
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (!ch || !ch.isTextBased?.()) return null;
    return ch;
  } catch {
    return null;
  }
}

function baseEmbed(title, color) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp(new Date());
}

function msgMeta(msg) {
  return {
    guildId: msg.guildId || "—",
    channelId: msg.channelId || "—",
    messageId: msg.id || "—",
    authorTag: msg.author?.tag || "—",
    authorId: msg.author?.id || "—",
  };
}

function fmtJump(msg) {
  try {
    return msg.url ? `[Aller au message](${msg.url})` : "";
  } catch {
    return "";
  }
}

function registerMessageLogs(client) {
  client.on("messageDelete", async (msg) => {
    try {
      if (!msg?.guildId) return;
      if (msg.author?.bot) return;

      const ch = await resolveLogChannel(client, msg.guildId);
      if (!ch) return;

      const e = baseEmbed("🗑️ Message supprimé", 0xe74c3c)
        .setDescription(
          [
            `**Salon :** <#${msg.channelId}>`,
            `**Auteur :** ${msg.author ? `<@${msg.author.id}>` : "—"}`,
            "",
            clamp(msg.content || "(pas de contenu)", 3500),
          ].join("\n")
        )
        .addFields(
          {
            name: "IDs",
            value: clamp(JSON.stringify(msgMeta(msg), null, 2), 1024),
            inline: false,
          }
        );

      await ch.send({ embeds: [e] }).catch(() => {});
    } catch {}
  });

  client.on("messageUpdate", async (oldMsg, newMsg) => {
    try {
      const msg = newMsg;
      if (!msg?.guildId) return;
      if (msg.author?.bot) return;

      const ch = await resolveLogChannel(client, msg.guildId);
      if (!ch) return;

      const before = clamp(oldMsg?.content || "(vide)", 1500);
      const after = clamp(newMsg?.content || "(vide)", 1500);
      if (before === after) return;

      const e = baseEmbed("✏️ Message modifié", 0xf1c40f)
        .setDescription(
          [
            `**Salon :** <#${msg.channelId}>`,
            `**Auteur :** <@${msg.author.id}>`,
            fmtJump(msg),
          ].filter(Boolean).join("\n")
        )
        .addFields(
          { name: "Avant", value: before || "(vide)", inline: false },
          { name: "Après", value: after || "(vide)", inline: false }
        );

      await ch.send({ embeds: [e] }).catch(() => {});
    } catch {}
  });
}

module.exports = { registerMessageLogs };
