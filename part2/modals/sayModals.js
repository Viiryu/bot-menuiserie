const { EmbedBuilder } = require('discord.js');
const { SAY_IDS } = require('../say/ids');
const { getPendingSay, clearPendingSay } = require('../say/sayState');

function parseHexColor(input) {
  if (!input) return null;
  const cleaned = String(input).trim();
  const m = cleaned.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  return parseInt(m[1], 16);
}

async function handleSayModals(interaction) {
  if (!interaction.isModalSubmit()) return false;
  if (interaction.customId !== SAY_IDS.MODAL_TEXT && interaction.customId !== SAY_IDS.MODAL_EMBED_BASIC) {
    return false;
  }

  const pending = getPendingSay(interaction.guildId, interaction.user.id);
  if (!pending) {
    await interaction.reply({ content: '❌ Brouillon expiré. Relance `/say`.', ephemeral: true }).catch(() => {});
    return true;
  }

  const channelId = pending.channelId;
  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel || !('send' in channel)) {
    clearPendingSay(interaction.guildId, interaction.user.id);
    await interaction.reply({ content: '❌ Salon introuvable. Relance `/say`.', ephemeral: true }).catch(() => {});
    return true;
  }

  try {
    if (interaction.customId === SAY_IDS.MODAL_TEXT) {
      const content = interaction.fields.getTextInputValue('content');
      await channel.send({ content });
      clearPendingSay(interaction.guildId, interaction.user.id);
      await interaction.reply({ content: `✅ Envoyé dans <#${channel.id}>.`, ephemeral: true });
      return true;
    }

    // Embed
    const title = interaction.fields.getTextInputValue('title')?.trim();
    const description = interaction.fields.getTextInputValue('description')?.trim();
    const colorStr = interaction.fields.getTextInputValue('color')?.trim();
    const footer = interaction.fields.getTextInputValue('footer')?.trim();
    const image = interaction.fields.getTextInputValue('image')?.trim();

    const embed = new EmbedBuilder();
    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);

    const color = parseHexColor(colorStr);
    if (color != null) embed.setColor(color);

    if (footer) embed.setFooter({ text: footer });
    if (image && /^https?:\/\//i.test(image)) embed.setImage(image);

    await channel.send({ embeds: [embed] });
    clearPendingSay(interaction.guildId, interaction.user.id);
    await interaction.reply({ content: `✅ Embed envoyé dans <#${channel.id}>.`, ephemeral: true });
    return true;
  } catch (err) {
    console.error('[say] modal submit error:', err);
    clearPendingSay(interaction.guildId, interaction.user.id);
    await interaction.reply({ content: '❌ Erreur lors de l’envoi.', ephemeral: true }).catch(() => {});
    return true;
  }
}

module.exports = { handleSayModals };
