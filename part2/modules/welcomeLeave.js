/**
 * part2/modules/welcomeLeave.js
 */

const { getGuildConfig } = require("../config/configStore");

function applyPlaceholders(text, member) {
  return String(text)
    .replaceAll("{user}", member.user.toString())
    .replaceAll("{username}", member.user.username)
    .replaceAll("{server}", member.guild.name);
}

async function resolveTextChannel(client, channelId) {
  if (!channelId) return null;
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch && ch.isTextBased()) return ch;
  } catch {}
  return null;
}

function registerWelcomeLeave(client) {
  client.on("guildMemberAdd", async (member) => {
    const cfg = getGuildConfig(member.guild.id);
    const ch = await resolveTextChannel(client, cfg.welcomeChannelId);
    if (!ch || !cfg.welcomeMessage) return;
    const msg = applyPlaceholders(cfg.welcomeMessage, member);
    if (!msg.trim()) return;
    await ch.send({ content: msg }).catch(() => {});
  });

  client.on("guildMemberRemove", async (member) => {
    const cfg = getGuildConfig(member.guild.id);
    const ch = await resolveTextChannel(client, cfg.leaveChannelId);
    if (!ch || !cfg.leaveMessage) return;
    const msg = applyPlaceholders(cfg.leaveMessage, member);
    if (!msg.trim()) return;
    await ch.send({ content: msg }).catch(() => {});
  });
}

module.exports = { registerWelcomeLeave };
