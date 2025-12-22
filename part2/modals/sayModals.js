// part2/modals/sayModals.js

const { EmbedBuilder } = require('discord.js');
const { SAY_IDS } = require('../say/ids');
const { getPendingSay, clearPendingSay } = require('../say/sayState');

const EPHEMERAL = 64; // InteractionResponseFlags.Ephemeral

async function handleSayModal(interaction) {
  try {
    if (!interaction.isModalSubmit()) return false;

    if (interaction.customId !== SAY_IDS.MODAL_TEXT && interaction.customId !== SAY_IDS.MODAL_EMBED_BASIC) {
      return false;
    }

    const pending = getPendingSay(interaction.guildId, interaction.user.id) || {};
    const channelId = pending.channelId;
    const type = pending.type;

    if (!channelId) {
      await interaction.reply({ content: '❌ Aucun salon cible défini. Utilise le panel /say ou refais la commande.', flags: EPHEMERAL });
      return true;
    }

    const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      await interaction.reply({ content: '❌ Salon introuvable ou non textuel.', flags: EPHEMERAL });
      return true;
    }

    if (interaction.customId === SAY_IDS.MODAL_TEXT) {
      let content = interaction.fields.getTextInputValue('content')?.trim();
      if (!content) {
        await interaction.reply({ content: '❌ Contenu vide.', flags: EPHEMERAL });
        return true;
      }

      if (type === 'test') {
        content = `🧪 **TEST**\n${content}`;
      }

      await channel.send({ content });
      clearPendingSay(interaction.guildId, interaction.user.id);
      await interaction.reply({ content: `✅ Message envoyé dans <#${channelId}>.`, flags: EPHEMERAL });
      return true;
    }

    if (interaction.customId === SAY_IDS.MODAL_EMBED_BASIC) {
      const title = interaction.fields.getTextInputValue('title')?.trim();
      const description = interaction.fields.getTextInputValue('description')?.trim();

      if (!description) {
        await interaction.reply({ content: '❌ Description vide.', flags: EPHEMERAL });
        return true;
      }

      const embed = new EmbedBuilder().setDescription(description);
      if (title) embed.setTitle(title);

      // si c'est un "test", on le marque dans l'embed
      if (type === 'test') {
        embed.setFooter({ text: 'TEST' });
      }

      await channel.send({ embeds: [embed] });
      clearPendingSay(interaction.guildId, interaction.user.id);
      await interaction.reply({ content: `✅ Embed envoyé dans <#${channelId}>.`, flags: EPHEMERAL });
      return true;
    }

    return false;
  } catch (err) {
    console.error('[part2] sayModals error:', err);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: '❌ Erreur interne /say (modal).', flags: EPHEMERAL });
      } else {
        await interaction.reply({ content: '❌ Erreur interne /say (modal).', flags: EPHEMERAL });
      }
    } catch {}
    return true;
  }
}

module.exports = { handleSayModal };
