// part2/commands/purge.js

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');

function canPurge(member) {
  try {
    if (!member) return false;
    if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
    return member.permissions?.has?.(PermissionFlagsBits.ManageMessages);
  } catch {
    return false;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('🧹 Supprimer des messages (staff).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('Nombre de messages à supprimer (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addUserOption((opt) =>
      opt
        .setName('user')
        .setDescription('Optionnel: ne supprimer que les messages de cet utilisateur')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!canPurge(interaction.member)) {
      return interaction.reply({ content: '⛔ Permission insuffisante.', ephemeral: true });
    }

    const amount = interaction.options.getInteger('amount', true);
    const user = interaction.options.getUser('user', false);

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased?.()) {
      return interaction.reply({ content: '❌ Channel invalide.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    // bulkDelete ne supprime pas les messages > 14 jours
    const fetched = await channel.messages.fetch({ limit: Math.min(100, amount) });
    let toDelete = [...fetched.values()];

    if (user) toDelete = toDelete.filter((m) => m.author?.id === user.id);

    toDelete = toDelete.slice(0, amount);

    const deleted = await channel.bulkDelete(toDelete, true);

    const embed = new EmbedBuilder()
      .setTitle('🧹 Purge effectuée')
      .setDescription(
        [
          `Channel: <#${channel.id}>`,
          `Demandé par: <@${interaction.user.id}>`,
          user ? `Filtre user: <@${user.id}>` : 'Filtre user: —',
          `Supprimés: **${deleted.size}**`,
        ].join('\n')
      )
      .setTimestamp(new Date());

    return interaction.editReply({ embeds: [embed] });
  },
};
