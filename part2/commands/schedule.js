// part2/commands/schedule.js

const { SlashCommandBuilder } = require('discord.js');
const { buildSchedulerPayload } = require('../scheduler/schedulerUI');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Créer/lister des schedules (messages programmés)')
    .addSubcommand((s) => s.setName('panel').setDescription('Afficher le panel scheduler')),

  async execute(interaction) {
    // Staff-only check is handled by outer router if needed; keep safe fallback
    const sub = interaction.options.getSubcommand?.() || 'panel';
    if (sub === 'panel') {
      await interaction.reply(buildSchedulerPayload(interaction.guild)).catch(async () => {
        // fallback ack
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Impossible d\'ouvrir le panel scheduler.', flags: 64 }).catch(() => {});
        }
      });
      return;
    }
  },
};
