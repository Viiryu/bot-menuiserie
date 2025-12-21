// part2/staff/staffPanel.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { STAFF_IDS } = require("./ids");
const { getGuildConfig } = require("../config/configStore");

function iconUrl(client) {
  try {
    return client.user?.displayAvatarURL?.() || null;
  } catch {
    return null;
  }
}

function fmtId(id) {
  return id ? `\`${id}\`` : "—";
}

function buildStaffPanelEmbed(client, guild) {
  const cfg = getGuildConfig(guild.id);

  const e = new EmbedBuilder()
    .setColor(0x111827)
    .setTitle("🪵 LGW — Panel Staff (Secrétaire)")
    .setDescription(
      [
        "Bienvenue dans le **panel centralisé**.",
        "",
        "👉 Tout passe par des **boutons / menus** (pas besoin d’écrire 15 commandes).",
        "",
        "⚙️ **Config rapide** (IDs actuels) :",
        `• Logs: ${fmtId(cfg.logChannelId)}`,
        `• Catégorie tickets: ${fmtId(cfg.ticketCategoryId)}`,
        `• Logs tickets: ${fmtId(cfg.ticketLogsChannelId)}`,
        `• Review candidatures: ${fmtId(cfg.applicationReviewChannelId)}`,
        `• Suggestions: ${fmtId(cfg.suggestionsChannelId)}`,
        `• Welcome: ${fmtId(cfg.welcomeChannelId)}`,
        `• Leave: ${fmtId(cfg.leaveChannelId)}`,
      ].join("\n")
    )
    .addFields(
      {
        name: "🧭 Raccourcis",
        value: [
          "• 🛡️ **Modération** : warn / timeout / purge",
          "• 📌 **Panels Publics** : tickets / candidatures / suggestions",
          "• 🤖 **Auto-réponses** : add/remove/list",
          "• 🧰 **Outils salon** : lock/unlock/slowmode",
        ].join("\n"),
        inline: false,
      },
      {
        name: "ℹ️ Note",
        value:
          "Les actions staff sont **loggées** (si `Logs` est configuré).",
        inline: false,
      }
    )
    .setTimestamp(new Date());

  const icon = iconUrl(client);
  if (icon) e.setAuthor({ name: "Le Secrétaire", iconURL: icon }).setThumbnail(icon);

  return e;
}

function buildStaffPanelComponents() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_MOD).setLabel("Modération").setEmoji("🛡️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_PANELS).setLabel("Panels publics").setEmoji("📌").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_CONFIG).setLabel("Configuration").setEmoji("⚙️").setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_AUTORESP).setLabel("Auto-réponses").setEmoji("🤖").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_CHAN_TOOLS).setLabel("Outils salon").setEmoji("🧰").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_HELP).setLabel("Aide").setEmoji("📖").setStyle(ButtonStyle.Secondary),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_CLOSE).setLabel("Fermer").setEmoji("✖️").setStyle(ButtonStyle.Danger),
  );

  return [row1, row2, row3];
}

function buildStaffPanelPayload(client, guild) {
  return {
    embeds: [buildStaffPanelEmbed(client, guild)],
    components: buildStaffPanelComponents(),
  };
}

module.exports = { buildStaffPanelPayload };
