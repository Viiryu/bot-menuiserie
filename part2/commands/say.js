// part2/commands/say.js

const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

const { SAY_IDS } = require('../say/ids');

function buildTextModal() {
  const modal = new ModalBuilder()
    .setCustomId(SAY_IDS.MODAL_TEXT)
    .setTitle('Say — Texte');

  const text = new TextInputBuilder()
    .setCustomId('text')
    .setLabel('Texte à envoyer')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(text));
  return modal;
}

function buildEmbedModal() {
  const modal = new ModalBuilder()
    .setCustomId(SAY_IDS.MODAL_EMBED_BASIC)
    .setTitle('Say — Embed');

  const title = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Titre (optionnel)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const desc = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const color = new TextInputBuilder()
    .setCustomId('color')
    .setLabel('Couleur HEX (ex: #5865F2)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const footer = new TextInputBuilder()
    .setCustomId('footer')
    .setLabel('Footer (optionnel)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(title),
    new ActionRowBuilder().addComponents(desc),
    new ActionRowBuilder().addComponents(color),
    new ActionRowBuilder().addComponents(footer)
  );
  return modal;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Envoyer un message en tant que bot')
    .addSubcommand((s) => s.setName('text').setDescription('Envoyer un message texte'))
    .addSubcommand((s) => s.setName('embed').setDescription('Envoyer un message embed')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'text') {
      return interaction.showModal(buildTextModal());
    }
    if (sub === 'embed') {
      return interaction.showModal(buildEmbedModal());
    }
    return interaction.reply({ content: '❌ Subcommande inconnue.', flags: 64 });
  },
};
