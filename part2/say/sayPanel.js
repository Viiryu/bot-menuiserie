// part2/say/sayPanel.js

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
} = require('discord.js');

const { SAY_IDS } = require('./ids');

function buildSayPanelEmbed(guild) {
  const guildName = guild?.name ?? 'le serveur';

  return new EmbedBuilder()
    .setTitle('🧩 Panel d’envoi')
    .setDescription(
      [
        `Choisis un **salon cible**, puis clique sur le type de message à envoyer.`,
        `• **Texte** : message simple`,
        `• **Embed** : titre + description + couleur (rapide)`,
        `• **Test** : envoie un message de test (préfixé 🧪)`,
        ``,
        `📌 Serveur : **${guildName}**`,
      ].join('\n')
    );
}

function buildSayPanelComponents() {
  const selectRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(SAY_IDS.SELECT_CHANNEL)
      .setPlaceholder('Choisir le salon cible…')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );

  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(SAY_IDS.BTN_PANEL_TEXT)
      .setLabel('Texte')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(SAY_IDS.BTN_PANEL_EMBED)
      .setLabel('Embed')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(SAY_IDS.BTN_PANEL_TEST)
      .setLabel('Test')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(SAY_IDS.BTN_CANCEL)
      .setLabel('Fermer')
      .setStyle(ButtonStyle.Danger)
  );

  const miscRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(SAY_IDS.BTN_PANEL_REFRESH)
      .setLabel('Rafraîchir')
      .setStyle(ButtonStyle.Secondary)
  );

  return [selectRow, actionsRow, miscRow];
}

function buildSayPanelPayload(guild) {
  return {
    embeds: [buildSayPanelEmbed(guild)],
    components: buildSayPanelComponents(),
  };
}

module.exports = {
  buildSayPanelPayload,
};
