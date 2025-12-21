const { SAY_IDS } = require('../say/ids');
const { setPendingSay, getPendingSay, clearPendingSay } = require('../say/sayState');

async function handleSayComponents(interaction) {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId !== SAY_IDS.SELECT_CHANNEL) return false;
    const [channelId] = interaction.values;
    const pending = getPendingSay(interaction.guildId, interaction.user.id);
    if (!pending) {
      await interaction.reply({ content: '❌ Brouillon expiré. Relance `/say`.', ephemeral: true }).catch(() => {});
      return true;
    }
    setPendingSay(interaction.guildId, interaction.user.id, { ...pending, channelId });
    await interaction.reply({ content: `✅ Salon choisi : <#${channelId}>. Relance le modal / clique publier.`, ephemeral: true }).catch(() => {});
    return true;
  }

  if (interaction.isButton()) {
    if (interaction.customId === SAY_IDS.BTN_CANCEL) {
      clearPendingSay(interaction.guildId, interaction.user.id);
      await interaction.reply({ content: '✅ Annulé.', ephemeral: true }).catch(() => {});
      return true;
    }
  }

  return false;
}

module.exports = { handleSayComponents };
