const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const EPHEMERAL = 64; // InteractionResponseFlags.Ephemeral

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Débannir un utilisateur (ID)')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) =>
      o.setName('user_id').setDescription('ID Discord de la personne à débannir').setRequired(true),
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Raison (optionnel)').setRequired(false),
    ),

  async execute(interaction) {
    try {
      const userId = interaction.options.getString('user_id', true).trim();
      const reason = interaction.options.getString('reason') ?? undefined;

      // basic sanity
      if (!/^\d{15,22}$/.test(userId)) {
        return interaction.reply({ content: '❌ ID invalide. Exemple: 123456789012345678', flags: EPHEMERAL });
      }

      await interaction.guild.bans.remove(userId, reason).catch((e) => {
        throw e;
      });

      return interaction.reply({ content: `✅ Débanni : <@${userId}> (${userId})`, flags: EPHEMERAL });
    } catch (e) {
      return interaction.reply({ content: `❌ Impossible de débannir. Détail: ${e?.message ?? e}`, flags: EPHEMERAL }).catch(() => {});
    }
  },
};
