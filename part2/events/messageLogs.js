const { EmbedBuilder } = require("discord.js");
const { getConfig } = require("../configStore");
const { DEFAULT_LOGS_CHANNEL_NAME } = require("../constants");
const { cut } = require("../util");
const { cacheMessage, getCached } = require("../messageCache");

// Trouve le salon logs (config DB sinon fallback #logs)
async function resolveLogsChannel(guild) {
  const cfg = await getConfig();
  if (cfg.logsChannelId) return guild.channels.cache.get(cfg.logsChannelId) ?? null;
  return guild.channels.cache.find((c) => c.name === DEFAULT_LOGS_CHANNEL_NAME) ?? null;
}

function registerMessageLogs(client) {
  // On remplit le cache
  client.on("messageCreate", (msg) => cacheMessage(msg));

  // Message modifié
  client.on("messageUpdate", async (oldMsg, newMsg) => {
    try {
      if (!newMsg.guild) return;
      if (newMsg.author?.bot) return;

      cacheMessage(newMsg);

      const before = oldMsg?.content ?? getCached(newMsg.id)?.content ?? "";
      const after = newMsg?.content ?? "";
      if (before === after) return;

      const logCh = await resolveLogsChannel(newMsg.guild);
      if (!logCh) return;

      const embed = new EmbedBuilder()
        .setTitle("✏️ Message modifié")
        .addFields(
          { name: "Auteur", value: `<@${newMsg.author.id}> (\`${newMsg.author.tag}\`)`, inline: true },
          { name: "Salon", value: `<#${newMsg.channelId}>`, inline: true },
          { name: "Avant", value: before ? cut(before) : "_(vide)_" },
          { name: "Après", value: after ? cut(after) : "_(vide)_" }
        )
        .setTimestamp(new Date());

      if (newMsg.url) embed.addFields({ name: "Lien", value: newMsg.url });

      await logCh.send({ embeds: [embed] });
    } catch (e) {
      console.error("[part2] messageUpdate log error:", e);
    }
  });

  // Message supprimé
  client.on("messageDelete", async (msg) => {
    try {
      if (!msg.guild) return;

      const cached = getCached(msg.id);
      const authorId = msg.author?.id ?? cached?.authorId;
      const authorTag = msg.author?.tag ?? cached?.authorTag ?? "Inconnu";
      if (!authorId) return;

      const logCh = await resolveLogsChannel(msg.guild);
      if (!logCh) return;

      const content = msg.content ?? cached?.content ?? "";
      const attachments = cached?.attachments ?? [];

      const embed = new EmbedBuilder()
        .setTitle("🗑️ Message supprimé")
        .addFields(
          { name: "Auteur", value: `<@${authorId}> (\`${authorTag}\`)`, inline: true },
          { name: "Salon", value: `<#${msg.channelId}>`, inline: true },
          { name: "Contenu", value: content ? cut(content) : "_(contenu indisponible)_" }
        )
        .setTimestamp(new Date());

      if (attachments.length) {
        embed.addFields({ name: "Pièces jointes", value: cut(attachments.join("\n")) });
      }

      await logCh.send({ embeds: [embed] });
    } catch (e) {
      console.error("[part2] messageDelete log error:", e);
    }
  });
}

module.exports = { registerMessageLogs, resolveLogsChannel };
