// part2/scheduler/schedulerUI.js
// Minimal scheduler UI + exports compatibles (pour /schedule)

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const IDS = Object.freeze({
  BTN_TEXT: 'P2_SCHED:BTN_TEXT',
  BTN_EMBED: 'P2_SCHED:BTN_EMBED',
  BTN_LIST: 'P2_SCHED:BTN_LIST',
  BTN_CLOSE: 'P2_SCHED:BTN_CLOSE',
  MODAL_TEXT: 'P2_SCHED:MODAL_TEXT',
  FIELD_WHEN: 'P2_SCHED:FIELD_WHEN',
  FIELD_TEXT: 'P2_SCHED:FIELD_TEXT',
});

function buildSchedulerPayload(guild) {
  const embed = new EmbedBuilder()
    .setTitle('🗓️ Scheduler')
    .setDescription(
      [
        'Planifie un message (brouillon) à publier plus tard.',
        '',
        '• **Texte** : message simple',
        '• **Embed** : bientôt',
        '• **Lister** : voir les schedules enregistrés',
      ].join('\n')
    )
    .setFooter({ text: guild ? `Serveur: ${guild.name}` : 'Serveur' })
    .setColor(0x111827);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(IDS.BTN_TEXT).setLabel('Texte').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(IDS.BTN_EMBED).setLabel('Embed').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IDS.BTN_LIST).setLabel('Lister').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IDS.BTN_CLOSE).setLabel('Fermer').setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row], flags: 64 };
}

function buildScheduleTextModal() {
  const modal = new ModalBuilder().setCustomId(IDS.MODAL_TEXT).setTitle('Créer un schedule (texte)');
  const when = new TextInputBuilder()
    .setCustomId(IDS.FIELD_WHEN)
    .setLabel('Quand ? (ex: 2026-01-02 18:30)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const text = new TextInputBuilder()
    .setCustomId(IDS.FIELD_TEXT)
    .setLabel('Texte à publier')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);
  modal.addComponents(
    new ActionRowBuilder().addComponents(when),
    new ActionRowBuilder().addComponents(text),
  );
  return modal;
}

// Simple in-memory store (safe fallback)
const _store = new Map(); // guildId -> array

function listSchedules(guildId) {
  return _store.get(guildId) || [];
}

function addSchedule(guildId, data) {
  const arr = _store.get(guildId) || [];
  arr.push({ id: String(Date.now()), ...data });
  _store.set(guildId, arr);
  return arr[arr.length - 1];
}

async function handleSchedulerInteraction(interaction) {
  const id = interaction.customId;

  if (interaction.isButton()) {
    if (id === IDS.BTN_CLOSE) {
      await interaction.update({ content: '✅ Fermé.', embeds: [], components: [] }).catch(() => {});
      return true;
    }
    if (id === IDS.BTN_TEXT) {
      await interaction.showModal(buildScheduleTextModal()).catch(() => {});
      return true;
    }
    if (id === IDS.BTN_EMBED) {
      await interaction.reply({ content: '⏳ Embed scheduler : bientôt.', flags: 64 }).catch(() => {});
      return true;
    }
    if (id === IDS.BTN_LIST) {
      const rows = listSchedules(interaction.guildId);
      const msg = rows.length
        ? rows.map((s) => `• **${s.when}** — ${s.text?.slice(0, 60) || ''}`).join('\n')
        : 'Aucun schedule pour le moment.';
      await interaction.reply({ content: msg, flags: 64 }).catch(() => {});
      return true;
    }
    return false;
  }

  if (interaction.isModalSubmit && interaction.isModalSubmit()) {
    if (id !== IDS.MODAL_TEXT) return false;
    await interaction.deferReply({ flags: 64 }).catch(() => {});
    const when = interaction.fields.getTextInputValue(IDS.FIELD_WHEN);
    const text = interaction.fields.getTextInputValue(IDS.FIELD_TEXT);
    addSchedule(interaction.guildId, { when, text, createdBy: interaction.user.id });
    await interaction.editReply({ content: `✅ Schedule enregistré : **${when}**\n📝 ${text.slice(0, 1000)}` }).catch(() => {});
    return true;
  }

  return false;
}

module.exports = {
  IDS,
  buildSchedulerPayload,
  buildSchedulerPanelPayload: buildSchedulerPayload,
  buildSchedulerUI: buildSchedulerPayload,
  handleSchedulerInteraction,
  handleSchedulerUIInteraction: handleSchedulerInteraction,
};
