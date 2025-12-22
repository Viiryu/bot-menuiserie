const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

const { SAY_IDS } = require('../say/ids');
const { setPendingSay } = require('../say/sayState');
const { buildSayPanelPayload } = require('../say/sayPanel');

const EPHEMERAL = 64; // InteractionResponseFlags.Ephemeral

function buildTextModal(title, customId) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
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
    .setDescription('Envoyer un message / embed (avec panel en bonus)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sc) =>
      sc
        .setName('panel')
        .setDescription('Ouvre le panel (sélection salon + boutons texte/embed/test)')
        .addBooleanOption((o) =>
          o
            .setName('public')
            .setDescription('Si true, poste le panel dans le salon (sinon: visible uniquement par toi)')
            .setRequired(false)
        )
    )
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
    )
    .addSubcommand((sc) =>
      sc
        .setName('test')
        .setDescription('Envoie un message de test (préfixé 🧪 TEST)')
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

    if (sub === 'panel') {
      const isPublic = interaction.options.getBoolean('public') === true;
      const payload = buildSayPanelPayload(interaction.guild);

      if (isPublic) {
        // Poste dans le salon
        await interaction.reply({ ...payload, flags: 0 });
      } else {
        // Visible seulement par l'utilisateur
        await interaction.reply({ ...payload, flags: EPHEMERAL });
      }

      // Initialise un salon par défaut (celui où l'utilisateur lance la commande)
      if (interaction.guildId) {
        setPendingSay(interaction.guildId, interaction.user.id, {
          channelId: interaction.channelId,
          type: 'text',
        });
      }
      return;
    }

    const targetChannel = interaction.options.getChannel('channel') ?? interaction.channel;
    if (!targetChannel || !('send' in targetChannel)) {
      return interaction.reply({ content: '❌ Salon invalide.', flags: EPHEMERAL });
    }

    const guildId = interaction.guildId;

    if (sub === 'text') {
      setPendingSay(guildId, interaction.user.id, { channelId: targetChannel.id, type: 'text' });
      return interaction.showModal(buildTextModal('Say • Texte', SAY_IDS.MODAL_TEXT));
    }

    if (sub === 'embed') {
      setPendingSay(guildId, interaction.user.id, { channelId: targetChannel.id, type: 'embed_basic' });
      return interaction.showModal(buildEmbedModal());
    }

    if (sub === 'test') {
      setPendingSay(guildId, interaction.user.id, { channelId: targetChannel.id, type: 'test' });
      return interaction.showModal(buildTextModal('Say • Test', SAY_IDS.MODAL_TEXT));
    }

    return interaction.reply({ content: '❌ Sous-commande inconnue.', flags: EPHEMERAL });
  },
};
