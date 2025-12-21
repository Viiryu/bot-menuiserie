const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');

const { SAY_IDS } = require('../say/ids');
const { setPendingSay } = require('../say/sayState');

function buildTextModal() {
  const modal = new ModalBuilder().setCustomId(SAY_IDS.MODAL_TEXT).setTitle('Say • Texte');
  const input = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('Message')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function buildEmbedModal() {
  const modal = new ModalBuilder().setCustomId(SAY_IDS.MODAL_EMBED_BASIC).setTitle('Say • Embed');

  const title = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Titre')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(256);

  const desc = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(4000);

  const color = new TextInputBuilder()
    .setCustomId('color')
    .setLabel('Couleur hex (ex: #2b2d31)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(16);

  const footer = new TextInputBuilder()
    .setCustomId('footer')
    .setLabel('Footer (optionnel)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(2048);

  const image = new TextInputBuilder()
    .setCustomId('image')
    .setLabel('Image URL (optionnel)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(4000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(title),
    new ActionRowBuilder().addComponents(desc),
    new ActionRowBuilder().addComponents(color),
    new ActionRowBuilder().addComponents(footer),
    new ActionRowBuilder().addComponents(image)
  );

  return modal;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Envoyer un message ou un embed via un modal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sc) =>
      sc
        .setName('text')
        .setDescription('Envoyer un message texte')
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Salon cible (par défaut: salon actuel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName('embed')
        .setDescription('Créer un embed via un modal')
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Salon cible (par défaut: salon actuel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const targetChannel = interaction.options.getChannel('channel') ?? interaction.channel;
    const guildId = interaction.guildId;

    if (!targetChannel || !('send' in targetChannel)) {
      return interaction.reply({ content: '❌ Salon invalide.', ephemeral: true });
    }

    // Store target channel for modal submit.
    setPendingSay(guildId, interaction.user.id, {
      channelId: targetChannel.id,
      kind: sub
    });

    if (sub === 'text') {
      return interaction.showModal(buildTextModal());
    }

    if (sub === 'embed') {
      return interaction.showModal(buildEmbedModal());
    }

    return interaction.reply({ content: '❌ Sous-commande inconnue.', ephemeral: true });
  }
};
