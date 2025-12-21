// part2/commands/unban.js

const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Débannir un utilisateur (par ID)')
    .addStringOption((o) =>
      o.setName('user_id').setDescription('ID du user à débannir').setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('raison').setDescription('Raison du débannissement').setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.BanMembers)) {
      return interaction.reply({ content: '❌ Permission manquante: BAN_MEMBERS', flags: 64 }).catch(() => {});
    }

    const userId = interaction.options.getString('user_id', true).trim();
    const reason = interaction.options.getString('raison') || 'Unban';

    try {
      await interaction.guild.members.unban(userId, reason);
      return interaction.reply({ content: `✅ Unban effectué pour **${userId}**.`, flags: 64 }).catch(() => {});
    } catch (e) {
      console.error('[unban] error:', e);
      return interaction.reply({ content: `❌ Impossible de débannir **${userId}**. (ID valide ? déjà unban ?)`, flags: 64 }).catch(() => {});
    }
  },
};
