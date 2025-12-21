// part2/commands/schedule.js
// Wrapper robuste: réactive la commande /schedule (Part2) même si ton module évolue.

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

function isStaff(member) {
  try {
    if (!member) return false;
    if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
    return member.permissions?.has?.(PermissionFlagsBits.ManageGuild) || member.permissions?.has?.(PermissionFlagsBits.ManageMessages);
  } catch {
    return false;
  }
}

async function safeBuildPayload(interaction) {
  let ui;
  try {
    ui = require('../scheduler/schedulerUI');
  } catch {
    ui = null;
  }

  // Essaye plusieurs signatures possibles.
  const candidates = [
    ui?.buildScheduleHomePayload,
    ui?.buildSchedulerHomePayload,
    ui?.buildHomePayload,
    ui?.buildPanelPayload,
  ].filter(Boolean);

  for (const fn of candidates) {
    try {
      // 1) fn(interaction)
      const p1 = await fn(interaction);
      if (p1 && typeof p1 === 'object') return p1;
    } catch {}
    try {
      // 2) fn(client, guild, user)
      const p2 = await fn(interaction.client, interaction.guild, interaction.user);
      if (p2 && typeof p2 === 'object') return p2;
    } catch {}
    try {
      // 3) fn(client, guild)
      const p3 = await fn(interaction.client, interaction.guild);
      if (p3 && typeof p3 === 'object') return p3;
    } catch {}
  }

  // Fallback: commande fonctionne, mais module absent/incompatible.
  return {
    content:
      '✅ /schedule est bien chargé, mais le module scheduler n’a pas été trouvé ou ses exports ne correspondent pas.\n' +
      '➡️ Vérifie que le dossier **part2/scheduler/** existe et que **schedulerUI.js** exporte un builder de payload.',
    ephemeral: true,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('🗓️ Ouvrir le panneau Schedule (staff).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '⛔ Staff uniquement.', ephemeral: true });
    }
    const payload = await safeBuildPayload(interaction);
    return interaction.reply(payload);
  },
};
