// part2/commands/ban.js
// Ban simple & propre (centralisé).

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');

function canBan(member) {
  try {
    if (!member) return false;
    if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
    return member.permissions?.has?.(PermissionFlagsBits.BanMembers);
  } catch {
    return false;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('⛔ Bannir un membre (staff).')
    .addUserOption((o) =>
      o.setName('user').setDescription('Le membre à bannir').setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Raison (optionnel)').setRequired(false)
    )
    // Discord n’impose pas de permissions ici, on garde le check runtime
    .setDMPermission(false),

  async execute(interaction) {
    if (!canBan(interaction.member)) {
      return interaction.reply({
        content: '⛔ Tu n’as pas la permission (BanMembers).',
        ephemeral: true,
      });
    }

    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || '—';

    const me = interaction.guild?.members?.me;
    if (!interaction.guild || !me) {
      return interaction.reply({ content: '❌ Guild introuvable.', ephemeral: true });
    }

    const target = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!target) {
      return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });
    }

    if (!target.bannable) {
      return interaction.reply({
        content: '❌ Je ne peux pas bannir ce membre (rôle trop haut ?).',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await target.ban({ reason: `${interaction.user.tag} | ${reason}` });

      const embed = new EmbedBuilder()
        .setTitle('⛔ Bannissement')
        .addFields(
          { name: 'Membre', value: `${user} (${user.id})`, inline: false },
          { name: 'Raison', value: reason, inline: false }
        )
        .setTimestamp(new Date());

      return interaction.editReply({ content: '✅ Ban effectué.', embeds: [embed] });
    } catch (e) {
      return interaction.editReply({
        content: `❌ Ban échoué: ${e?.message || e}`,
      });
    }
  },
};
