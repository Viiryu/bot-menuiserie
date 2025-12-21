// part2/commands/help.js

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('📖 Affiche l’aide du bot (Part2).')
    .setDMPermission(false),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('📖 Aide — LGW Secrétaire (Part2)')
      .setDescription(
        [
          'Voici les commandes **Part2** (staff & outils).',
          '',
          '• `/staff panel` : ouvre le panel staff (boutons / config / modules).',
          '• `/say` : studio de message (texte / embed) avec preview & publish.',
          '• `/autorole` : panel autorôle (boutons / config).',
          '• `/schedule` : module de programmations (drafts/modals).',
          '• `/purge` : purge de messages (ManageMessages).',
          '• `/ban` : bannir un membre (BanMembers).',
          '',
          'Astuce: si une interaction affiche **"Échec de l\'interaction"**, check `node tools/doctor.js` et la console du bot.',
        ].join('\n')
      )
      .setTimestamp(new Date());

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
