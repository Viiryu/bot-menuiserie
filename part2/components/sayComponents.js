// part2/components/sayComponents.js

const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const { SAY_IDS } = require('../say/ids');
const { setPendingSay, getPendingSay, clearPendingSay } = require('../say/sayState');
const { buildSayPanelPayload } = require('../say/sayPanel');

function buildTextModal(title, customId) {
  const input = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('Contenu')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(4000);

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function buildEmbedBasicModal(customId) {
  const title = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Titre')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(256);

  const description = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(4000);

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Créer un embed')
    .addComponents(
      new ActionRowBuilder().addComponents(title),
      new ActionRowBuilder().addComponents(description)
    );
}

async function handleSayComponent(interaction) {
  try {
    // Channel select
    if (interaction.isChannelSelectMenu() && interaction.customId === SAY_IDS.SELECT_CHANNEL) {
      const channelId = interaction.values?.[0];
      if (!channelId) {
        return interaction.reply({ content: '❌ Aucun salon sélectionné.', flags: 64 });
      }

      setPendingSay(interaction.guildId, interaction.user.id, {
        ...getPendingSay(interaction.guildId, interaction.user.id),
        channelId,
      });

      return interaction.reply({
        content: `✅ Salon cible défini : <#${channelId}>`,
        flags: 64,
      });
    }

    // Buttons
    if (!interaction.isButton()) return false;

    if (
      interaction.customId !== SAY_IDS.BTN_CANCEL &&
      interaction.customId !== SAY_IDS.BTN_PANEL_TEXT &&
      interaction.customId !== SAY_IDS.BTN_PANEL_EMBED &&
      interaction.customId !== SAY_IDS.BTN_PANEL_TEST &&
      interaction.customId !== SAY_IDS.BTN_PANEL_REFRESH
    ) {
      return false;
    }

    if (interaction.customId === SAY_IDS.BTN_CANCEL) {
      clearPendingSay(interaction.guildId, interaction.user.id);
      // On "ferme" le panel en le vidant
      return interaction.update({ content: '✅ Panel fermé.', embeds: [], components: [] });
    }

    if (interaction.customId === SAY_IDS.BTN_PANEL_REFRESH) {
      return interaction.update(buildSayPanelPayload(interaction.guild));
    }

    const pending = getPendingSay(interaction.guildId, interaction.user.id) || {};
    const channelId = pending.channelId || interaction.channelId;

    if (interaction.customId === SAY_IDS.BTN_PANEL_TEXT) {
      setPendingSay(interaction.guildId, interaction.user.id, { channelId, type: 'text' });
      await interaction.showModal(buildTextModal('Envoyer un texte', SAY_IDS.MODAL_TEXT));
      return true;
    }

    if (interaction.customId === SAY_IDS.BTN_PANEL_TEST) {
      setPendingSay(interaction.guildId, interaction.user.id, { channelId, type: 'test' });
      await interaction.showModal(buildTextModal('Envoyer un TEST (texte)', SAY_IDS.MODAL_TEXT));
      return true;
    }

    if (interaction.customId === SAY_IDS.BTN_PANEL_EMBED) {
      setPendingSay(interaction.guildId, interaction.user.id, { channelId, type: 'embed_basic' });
      await interaction.showModal(buildEmbedBasicModal(SAY_IDS.MODAL_EMBED_BASIC));
      return true;
    }

    return false;
  } catch (err) {
    console.error('[part2] sayComponents error:', err);
    // Si on a déjà répondu, on ignore
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: '❌ Erreur interne (sayComponents).', flags: 64 });
      } else {
        await interaction.reply({ content: '❌ Erreur interne (sayComponents).', flags: 64 });
      }
    } catch {}
    return true;
  }
}

module.exports = { handleSayComponent };
