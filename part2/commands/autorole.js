const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

// Simple Autorole panel: pick roles from config file (part2/autorole/autoroleStore.json)
// If the autorole system is not configured yet, it posts an explanatory message.

function safeReadJSON(filepath, fallback) {
  try {
    const fs = require('fs');
    if (!fs.existsSync(filepath)) return fallback;
    const raw = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

const data = new SlashCommandBuilder()
  .setName('autorole')
  .setDescription('Autoroles: panneau de sélection')
  .addSubcommand((s) =>
    s.setName('panel').setDescription('Publie le panneau autoroles dans ce salon')
  );

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub !== 'panel') return interaction.reply({ content: 'Sous-commande inconnue.', ephemeral: true });

  // Store format (expected): { roles: [{ roleId, label, description }], title, description }
  const path = require('path');
  const storePath = path.join(__dirname, '..', 'autorole', 'autoroleStore.json');
  const store = safeReadJSON(storePath, {});
  const roles = Array.isArray(store.roles) ? store.roles : [];

  if (!roles.length) {
    const e = new EmbedBuilder()
      .setTitle('🧩 Autoroles')
      .setDescription(
        'Aucun autorole configuré pour le moment.\n' +
          'Le staff doit d\'abord remplir `part2/autorole/autoroleStore.json`.'
      );
    await interaction.reply({ embeds: [e], ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(store.title || '🧩 Autoroles')
    .setDescription(store.description || 'Choisis tes rôles ci-dessous :');

  const menu = new StringSelectMenuBuilder()
    .setCustomId('P2_AUTOROLE:SELECT')
    .setPlaceholder('Sélectionne un rôle…')
    .setMinValues(0)
    .setMaxValues(Math.min(roles.length, 25))
    .addOptions(
      roles.slice(0, 25).map((r) => ({
        label: String(r.label || r.roleId || 'Rôle').slice(0, 100),
        value: String(r.roleId || ''),
        description: r.description ? String(r.description).slice(0, 100) : undefined,
      }))
    );

  const row = new ActionRowBuilder().addComponents(menu);

  await interaction.reply({ content: '✅ Panneau publié.', ephemeral: true });
  await interaction.channel.send({ embeds: [embed], components: [row] });
}

module.exports = { data, execute };
