const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const { buildSayPanelPayload } = require('../say/sayPanel');
const { setPendingSay } = require('../say/sayState');

const EPHEMERAL = 64; // InteractionResponseFlags.Ephemeral

module.exports = {
  data: new SlashCommandBuilder()
    .setName('envoie')
    .setDescription('Panel centralisé: envoyer Texte / Embed / Test')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addBooleanOption((o) =>
      o
        .setName('public')
        .setDescription('Si true, poste le panel dans le salon (sinon: visible uniquement par toi)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const isPublic = interaction.options.getBoolean('public') === true;
    const payload = buildSayPanelPayload(interaction.guild);

    if (isPublic) {
      await interaction.reply({ ...payload, flags: 0 });
    } else {
      await interaction.reply({ ...payload, flags: EPHEMERAL });
    }

    // Salon par défaut = là où la commande est utilisée
    if (interaction.guildId) {
      setPendingSay(interaction.guildId, interaction.user.id, {
        channelId: interaction.channelId,
        type: 'text',
      });
    }
  },
};
