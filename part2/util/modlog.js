// part2/util/modlog.js
// Helper pour envoyer des logs premium (embeds) dans un salon configuré.

const { EmbedBuilder } = require("discord.js");
const { getConfig } = require("../config/configState");

function pickColor(action) {
  const a = String(action || "").toLowerCase();
  if (["ban", "kick"].includes(a)) return 0xE74C3C;
  if (["warn", "timeout"].includes(a)) return 0xF1C40F;
  if (["unban", "untimeout", "unwarn"].includes(a)) return 0x2ECC71;
  if (["purge", "lock", "unlock", "slowmode"].includes(a)) return 0x3498DB;
  return 0x95A5A6;
}

function safeUserTag(u) {
  if (!u) return "—";
  return u.tag || `${u.username || "user"}#${u.discriminator || "0000"}`;
}

function buildLogEmbed({
  action,
  actor,
  target,
  channel,
  reason,
  fields = [],
  footer,
}) {
  const e = new EmbedBuilder()
    .setTitle(`🧾 Log — ${action}`)
    .setColor(pickColor(action))
    .setTimestamp(new Date());

  e.addFields(
    { name: "👤 Staff", value: actor ? `<@${actor.id}> (${safeUserTag(actor)})` : "—", inline: true },
    { name: "🎯 Cible", value: target ? `<@${target.id}> (${safeUserTag(target)})` : "—", inline: true },
    { name: "📍 Salon", value: channel?.id ? `<#${channel.id}>` : "—", inline: true },
  );

  if (reason) e.addFields({ name: "📝 Raison", value: String(reason).slice(0, 1024), inline: false });

  for (const f of (fields || [])) {
    if (!f?.name || f?.value == null) continue;
    e.addFields({ name: String(f.name).slice(0, 256), value: String(f.value).slice(0, 1024), inline: !!f.inline });
  }

  e.setFooter({ text: footer || "LGW — Le Secrétaire" });
  return e;
}

async function sendToChannel(guild, channelId, payload) {
  if (!guild || !channelId) return false;
  const ch = await guild.channels.fetch(channelId).catch(() => null);
  if (!ch || !ch.isTextBased?.()) return false;
  await ch.send(payload).catch(() => null);
  return true;
}

async function logAction(interaction, logEmbed) {
  const guild = interaction.guild;
  if (!guild) return;

  const modlogId = getConfig(guild.id, "modLogChannelId", null);
  const logsId = getConfig(guild.id, "logChannelId", null);

  const payload = { embeds: [logEmbed] };

  // Priorité: modlog -> logs
  if (await sendToChannel(guild, modlogId, payload)) return;
  await sendToChannel(guild, logsId, payload);
}

module.exports = { buildLogEmbed, logAction };
