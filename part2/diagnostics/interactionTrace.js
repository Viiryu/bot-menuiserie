// part2/diagnostics/interactionTrace.js
// Mode diag: trace interactions + ACK safe.
// Active via .env : DIAG_INTERACTIONS=true
// Optionnel: DIAG_LOG_CHANNEL_ID=... pour envoyer les erreurs dans un salon Discord

const { EmbedBuilder, MessageFlagsBitField } = require("discord.js");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

function _typeName(i) {
  try {
    if (i.isChatInputCommand?.() && i.isChatInputCommand()) return "chat_command";
    if (i.isAutocomplete?.() && i.isAutocomplete()) return "autocomplete";
    if (i.isModalSubmit?.() && i.isModalSubmit()) return "modal_submit";
    if (i.isButton?.() && i.isButton()) return "button";
    if (i.isAnySelectMenu?.() && i.isAnySelectMenu()) return "select_menu";
    if (i.isStringSelectMenu?.() && i.isStringSelectMenu()) return "string_select";
    if (i.isUserSelectMenu?.() && i.isUserSelectMenu()) return "user_select";
    if (i.isRoleSelectMenu?.() && i.isRoleSelectMenu()) return "role_select";
    if (i.isMentionableSelectMenu?.() && i.isMentionableSelectMenu()) return "mentionable_select";
    if (i.isChannelSelectMenu?.() && i.isChannelSelectMenu()) return "channel_select";
  } catch {}
  return "interaction";
}

function summarizeInteraction(i) {
  return {
    type: _typeName(i),
    commandName: i.commandName || null,
    customId: i.customId || null,
    userId: i.user?.id || null,
    userTag: i.user?.tag || null,
    guildId: i.guildId || null,
    channelId: i.channelId || null,
  };
}

async function sendDiagEmbed(client, title, desc, fields = []) {
  const channelId = process.env.DIAG_LOG_CHANNEL_ID || "";
  if (!channelId) return;
  try {
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (!ch || !ch.isTextBased?.()) return;

    const embed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle(`🧪 DIAG • ${title}`)
      .setDescription(String(desc || "—").slice(0, 3800))
      .setTimestamp(new Date());

    if (fields.length) embed.addFields(fields.slice(0, 24));

    await ch.send({ embeds: [embed] }).catch(() => {});
  } catch {}
}

/**
 * ACK safe pour éviter "Échec de l'interaction".
 * On répond TOUJOURS (ou deferUpdate) si ce n'est pas géré.
 */
async function safeAcknowledge(interaction, reason = "Interaction non gérée") {
  try {
    if (!interaction || interaction.replied || interaction.deferred) return;

    const info = summarizeInteraction(interaction);
    const msg = `⚠️ ${reason}\n• type: \`${info.type}\`\n• cmd: \`${info.commandName || "—"}\`\n• id: \`${info.customId || "—"}\``;

    // Composants (boutons/menus) => deferUpdate (silencieux), puis message éphémère en followUp
    if (interaction.isButton?.() || interaction.isAnySelectMenu?.()) {
      await interaction.deferUpdate().catch(() => null);
      await interaction.followUp({ content: msg, flags: EPHEMERAL }).catch(() => {});
      return;
    }

    // Modal submit => reply éphémère
    if (interaction.isModalSubmit?.()) {
      await interaction.reply({ content: msg, flags: EPHEMERAL }).catch(() => {});
      return;
    }

    // Slash command => reply éphémère
    if (interaction.isChatInputCommand?.()) {
      await interaction.reply({ content: msg, flags: EPHEMERAL }).catch(() => {});
      return;
    }

    await interaction.reply({ content: msg, flags: EPHEMERAL }).catch(() => {});
  } catch {}
}

async function traceInteraction(interaction, handled, err = null) {
  const enabled = String(process.env.DIAG_INTERACTIONS || "false").toLowerCase() === "true";
  if (!enabled) return;

  const info = summarizeInteraction(interaction);
  const status = handled ? "HANDLED" : "UNHANDLED";
  const line = `[DIAG] ${status} type=${info.type} cmd=${info.commandName || "-"} customId=${info.customId || "-"} user=${info.userTag || info.userId || "-"}`;
  if (err) console.error(line, "\n", err?.stack || err);
  else console.log(line);

  if (err && interaction?.client) {
    await sendDiagEmbed(interaction.client, status, err?.stack || String(err), [
      { name: "type", value: String(info.type), inline: true },
      { name: "command", value: String(info.commandName || "—"), inline: true },
      { name: "customId", value: String(info.customId || "—").slice(0, 1024), inline: false },
      { name: "user", value: String(info.userTag || info.userId || "—"), inline: true },
      { name: "guild", value: String(info.guildId || "—"), inline: true },
      { name: "channel", value: String(info.channelId || "—"), inline: true },
    ]);
  }
}

module.exports = { traceInteraction, safeAcknowledge, summarizeInteraction };
