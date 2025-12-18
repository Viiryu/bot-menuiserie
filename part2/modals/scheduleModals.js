const { EmbedBuilder, MessageFlagsBitField } = require("discord.js");
const { IDS } = require("../constants");
const { isStaff } = require("../permissions");
const { getPending, clearPending, addSchedule } = require("../scheduler/schedulerState");
const { parseHexColor } = require("../util");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

async function handleScheduleModals(interaction) {
  if (!interaction.isModalSubmit()) return false;

  if (interaction.customId !== IDS.SCHEDULE_TEXT_MODAL && interaction.customId !== IDS.SCHEDULE_EMBED_MODAL) {
    return false;
  }

  try {
    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return true;
    }

    const pending = getPending(interaction.user.id);
    if (!pending || pending.guildId !== interaction.guildId) {
      await interaction.reply({ content: "❌ Brouillon expiré. Refais `/schedule create`.", flags: EPHEMERAL });
      return true;
    }

    let payload = null;

    if (interaction.customId === IDS.SCHEDULE_TEXT_MODAL) {
      const content = interaction.fields.getTextInputValue("content") || "";
      payload = { content };
    } else {
      const title = interaction.fields.getTextInputValue("title") || "";
      const description = interaction.fields.getTextInputValue("description") || "";
      const colorRaw = interaction.fields.getTextInputValue("color") || "";
      const footerText = interaction.fields.getTextInputValue("footer") || "";
      const tsRaw = (interaction.fields.getTextInputValue("timestamp") || "").trim().toLowerCase();
      const timestamp = !(tsRaw === "off" || tsRaw === "false" || tsRaw === "0" || tsRaw === "no");

      // petit check couleur (optionnel)
      if (colorRaw && parseHexColor(colorRaw) === null) {
        await interaction.reply({ content: "❌ Couleur invalide. Exemple: #ff8800", flags: EPHEMERAL });
        return true;
      }

      payload = { title, description, colorRaw, footerText, timestamp };
    }

    const sched = addSchedule({
      guildId: pending.guildId,
      channelId: pending.channelId,
      type: pending.type,
      everyMs: pending.everyMs,
      payload,
      createdBy: interaction.user.id,
      startDelayMs: pending.startDelayMs || 0,
      ping: pending.ping || "",
    });

    clearPending(interaction.user.id);

    const info = new EmbedBuilder()
      .setTitle("✅ Scheduler créé")
      .setDescription(
        [
          `**ID:** ${sched.id}`,
          `**Type:** ${sched.type}`,
          `**Salon:** <#${sched.channelId}>`,
          `**Toutes les:** ${Math.round(sched.everyMs / 60000)} min`,
        ].join("\n")
      )
      .setTimestamp(new Date());

    await interaction.reply({ embeds: [info], flags: EPHEMERAL });
    return true;
  } catch (e) {
    console.error("[part2] schedule modal error:", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Erreur scheduler (modal).", flags: EPHEMERAL });
    }
    return true;
  }
}

module.exports = { handleScheduleModals };
