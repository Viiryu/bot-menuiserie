// part2/staff/staffPanel.js

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const { STAFF_IDS } = require('./ids');

const COLOR = 0x111827;

async function resolveGuild(client, guildOrId) {
  if (!guildOrId) return null;
  if (typeof guildOrId === 'object' && guildOrId.id) return guildOrId;
  const id = String(guildOrId);
  return (
    client.guilds.cache.get(id) || (await client.guilds.fetch(id).catch(() => null))
  );
}

function buildStaffPanelEmbed(client, guild) {
  const icon = client.user?.displayAvatarURL?.() || null;
  const guildName = guild?.name || 'Serveur';

  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🛡️ Panel Staff — Centralisé')
    .setDescription(
      [
        `🏷️ **Serveur :** ${guildName}`,
        '',
        '👉 Utilise les boutons ci-dessous pour naviguer.',
        '• **Modération** : warn / timeout / purge',
        '• **Panels** : tickets / candidatures / suggestions',
        '• **Auto-réponses** : add / remove / list',
        '• **Config** : logs / salons / rôles',
        '• **Outils salon** : lock / slowmode',
      ].join('\n')
    )
    .setFooter({ text: 'LGW • Secrétaire • Staff' })
    .setTimestamp(new Date())
    .setThumbnail(icon);
}

function buildStaffPanelComponents() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(STAFF_IDS.BTN_MOD)
      .setLabel('Modération')
      .setEmoji('🧰')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(STAFF_IDS.BTN_PANELS)
      .setLabel('Panels')
      .setEmoji('📌')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(STAFF_IDS.BTN_AUTORESP)
      .setLabel('Auto-réponses')
      .setEmoji('🤖')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(STAFF_IDS.BTN_CONFIG)
      .setLabel('Config')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(STAFF_IDS.BTN_CHAN_TOOLS)
      .setLabel('Salon')
      .setEmoji('🔧')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(STAFF_IDS.BTN_HELP)
      .setLabel('Aide')
      .setEmoji('📖')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(STAFF_IDS.BTN_CLOSE)
      .setLabel('Fermer')
      .setEmoji('🧹')
      .setStyle(ButtonStyle.Danger)
  );

  return [row1, row2];
}

async function buildStaffPanelPayload(client, guildOrId) {
  const guild = await resolveGuild(client, guildOrId);
  return {
    embeds: [buildStaffPanelEmbed(client, guild)],
    components: buildStaffPanelComponents(),
  };
}

module.exports = { buildStaffPanelPayload };
