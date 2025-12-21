/**
 * part2/util/modlog.js
 * Embeds simples pour logs modération.
 */

const { EmbedBuilder } = require("discord.js");

function buildModLogEmbed({ title, actor, target, reason, extra }) {
  const e = new EmbedBuilder().setTitle(title).setTimestamp(new Date());
  if (actor) e.addFields({ name: "Staff", value: actor.toString(), inline: true });
  if (target) e.addFields({ name: "Cible", value: target.toString(), inline: true });
  if (reason) e.addFields({ name: "Raison", value: String(reason).slice(0, 1024) });
  if (extra) e.addFields({ name: "Détails", value: String(extra).slice(0, 1024) });
  return e;
}

function buildWarnDM({ guildName, reason }) {
  return new EmbedBuilder()
    .setTitle(`Avertissement - ${guildName}`)
    .setDescription(reason ? String(reason) : "Vous avez reçu un avertissement.")
    .setTimestamp(new Date());
}

function buildTimeoutDM({ guildName, durationText, reason }) {
  const desc = [`Durée: ${durationText}`];
  if (reason) desc.push(`Raison: ${reason}`);
  return new EmbedBuilder()
    .setTitle(`Timeout - ${guildName}`)
    .setDescription(desc.join("\n"))
    .setTimestamp(new Date());
}

function buildPurgeLogEmbed({ actor, channel, amount }) {
  return new EmbedBuilder()
    .setTitle("Purge")
    .addFields(
      { name: "Staff", value: actor?.toString?.() ?? "?", inline: true },
      { name: "Salon", value: channel?.toString?.() ?? "?", inline: true },
      { name: "Messages", value: String(amount ?? "?"), inline: true }
    )
    .setTimestamp(new Date());
}

module.exports = {
  buildModLogEmbed,
  buildWarnDM,
  buildTimeoutDM,
  buildPurgeLogEmbed,
};
