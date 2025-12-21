// part2/commands/staff.js

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildStaffPanelPayload } = require('../staff/staffPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staff')
    .setDescription('Outils staff (panel, config, modération...)')
    .addSubcommand((s) => s.setName('panel').setDescription('Afficher le panel staff'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== 'panel') return interaction.reply({ content: '❌ Subcommande inconnue.', flags: 64 });
    const payload = await buildStaffPanelPayload(interaction.client, interaction.guild || interaction.guildId);
    // panel public (pas éphémère) pour que les boutons restent
    return interaction.reply(payload);
  },
};
