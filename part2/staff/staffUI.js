// part2/staff/staffUI.js
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
} = require("discord.js");

const { STAFF_IDS } = require("./ids");
const { ANNOUNCE_TEMPLATES, getTemplate } = require("./templates/announcementTemplates");
const { getGuildConfig } = require("./staffConfigState");
const { parseHexColor } = require("../util");

function colorGold() {
  return parseHexColor("#CBA135") ?? 0xCBA135;
}

function pill(v, ok = true) {
  return ok ? `✅ ${v}` : `❌ ${v}`;
}

function buildHomeEmbed(guild, cfg, statusText) {
  const e = new EmbedBuilder()
    .setTitle("🧰 Panel Staff — Le Secrétaire")
    .setColor(colorGold())
    .setDescription(
      [
        "Bienvenue dans le **hub staff** : modération, annonces, auto-rôles, configuration…",
        "Tout est **centralisé** (pas 40 commandes).",
        "",
        statusText ? `**Statut :** ${statusText}` : null,
      ].filter(Boolean).join("\n")
    )
    .addFields(
      { name: "🧾 Logs", value: cfg.logsChannelId ? `<#${cfg.logsChannelId}>` : "— (à config)", inline: true },
      { name: "🛡️ Mod logs", value: cfg.modLogsChannelId ? `<#${cfg.modLogsChannelId}>` : "—", inline: true },
      { name: "🧯 Maintenance", value: cfg.maintenance ? "✅ ON" : "❌ OFF", inline: true },
    )
    .setFooter({ text: "LGW — Panel Staff" })
    .setTimestamp(new Date());
  return e;
}

function buildHomeComponents() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_PANEL_MOD).setLabel("Modération").setEmoji("🛡️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_PANEL_ANN).setLabel("Annonces").setEmoji("📣").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_PANEL_AUTOROLE).setLabel("Auto-rôles").setEmoji("🎭").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_PANEL_CONFIG).setLabel("Config").setEmoji("⚙️").setStyle(ButtonStyle.Secondary),
  );

  return [row1];
}

function buildModEmbed(cfg, statusText) {
  return new EmbedBuilder()
    .setTitle("🛡️ Modération — Actions rapides")
    .setColor(parseHexColor("#7A2E2E") ?? 0x7A2E2E)
    .setDescription(
      [
        "Actions staff **rapides** avec modals.",
        cfg.maintenance ? "🧯 **Maintenance ON** : certaines actions sont bloquées." : null,
        "",
        statusText ? `**Statut :** ${statusText}` : null,
      ].filter(Boolean).join("\n")
    )
    .addFields(
      { name: "🧾 Logs", value: cfg.modLogsChannelId ? `<#${cfg.modLogsChannelId}>` : "—", inline: true },
      { name: "⚙️ Conseil", value: "Place le rôle du bot au-dessus des rôles à gérer.", inline: true }
    )
    .setFooter({ text: "Modération — Le Secrétaire" })
    .setTimestamp(new Date());
}

function buildModComponents() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_MOD_WARN).setLabel("Warn").setEmoji("⚠️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_MOD_TIMEOUT).setLabel("Timeout").setEmoji("⏳").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_MOD_KICK).setLabel("Kick").setEmoji("👢").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_MOD_BAN).setLabel("Ban").setEmoji("🔨").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_MOD_PURGE).setLabel("Purge").setEmoji("🧹").setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_PANEL_HOME).setLabel("Retour").setEmoji("⬅️").setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}

function buildAnnounceEmbed(cfg, draft, statusText) {
  const t = getTemplate(draft?.templateKey || "recrutement");
  return new EmbedBuilder()
    .setTitle("📣 Annonces — Studio (templates)")
    .setColor(parseHexColor("#2E6B7A") ?? 0x2E6B7A)
    .setDescription(
      [
        "Choisis un **template**, ajuste le texte dans un **modal**, puis publie.",
        "🔕 Publier silencieux = pas de ping.",
        "🔔 Publier mention = ping un rôle configuré (ou @everyone si tu forces).",
        "",
        statusText ? `**Statut :** ${statusText}` : null,
      ].filter(Boolean).join("\n")
    )
    .addFields(
      { name: "🎯 Salon cible", value: draft?.channelId ? `<#${draft.channelId}>` : "— (choisis)", inline: true },
      { name: "🔔 Rôle ping", value: cfg.announcePingRoleId ? `<@&${cfg.announcePingRoleId}>` : "—", inline: true },
      { name: "🧩 Template", value: `**${t.label}**`, inline: true },
    )
    .setFooter({ text: "Annonces — Le Secrétaire" })
    .setTimestamp(new Date());
}

function renderTemplate(tpl, vars) {
  let out = tpl;
  for (const [k, v] of Object.entries(vars || {})) {
    out = out.replaceAll(`{${k}}`, String(v ?? ""));
  }
  // clean extra blank lines
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

function buildAnnouncePreviewEmbed(draft) {
  const t = getTemplate(draft.templateKey);
  const title = renderTemplate(t.title, draft.vars);
  const body = renderTemplate(t.body, draft.vars);

  return new EmbedBuilder()
    .setTitle(title.slice(0, 256))
    .setDescription(body.slice(0, 4000))
    .setColor(parseHexColor(draft.color || "#CBA135") ?? colorGold())
    .setFooter({ text: draft.footer || "Annonce — Le Secrétaire" })
    .setTimestamp(new Date());
}

function buildAnnounceComponents(draft) {
  const templateSelect = new StringSelectMenuBuilder()
    .setCustomId(STAFF_IDS.SELECT_ANN_TEMPLATE)
    .setPlaceholder("📌 Choisir un template…")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      ANNOUNCE_TEMPLATES.slice(0, 25).map((t) => ({
        label: t.label.slice(0, 100),
        value: t.key,
      }))
    );

  const row0 = new ActionRowBuilder().addComponents(templateSelect);

  const chanSelect = new ChannelSelectMenuBuilder()
    .setCustomId("P2_STAFF_ANN_CHANNEL")
    .setPlaceholder("🎯 Choisir le salon cible…")
    .setMinValues(1)
    .setMaxValues(1)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  const rowChan = new ActionRowBuilder().addComponents(chanSelect);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_ANN_EDIT).setLabel("Éditer").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_ANN_PUBLISH).setLabel("Publier").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_ANN_PUBLISH_SILENT).setLabel("Silencieux").setEmoji("🔕").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_ANN_PUBLISH_MENTION).setLabel("Mention").setEmoji("🔔").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_ANN_CANCEL).setLabel("Annuler").setEmoji("🗑️").setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_PANEL_HOME).setLabel("Retour").setEmoji("⬅️").setStyle(ButtonStyle.Secondary),
  );

  return [row0, rowChan, row1, row2];
}

function buildConfigEmbed(cfg, statusText) {
  return new EmbedBuilder()
    .setTitle("⚙️ Configuration — Staff")
    .setColor(parseHexColor("#444B5A") ?? 0x444B5A)
    .setDescription(
      [
        "Configure les **salons logs** + rôle ping annonces.",
        "",
        statusText ? `**Statut :** ${statusText}` : null,
      ].filter(Boolean).join("\n")
    )
    .addFields(
      { name: "🧾 Logs (audit)", value: cfg.logsChannelId ? `<#${cfg.logsChannelId}>` : "—", inline: true },
      { name: "🛡️ Mod logs", value: cfg.modLogsChannelId ? `<#${cfg.modLogsChannelId}>` : "—", inline: true },
      { name: "🔔 Rôle ping", value: cfg.announcePingRoleId ? `<@&${cfg.announcePingRoleId}>` : "—", inline: true },
      { name: "🧯 Maintenance", value: cfg.maintenance ? "✅ ON" : "❌ OFF", inline: true },
    )
    .setFooter({ text: "Config — Le Secrétaire" })
    .setTimestamp(new Date());
}

function buildConfigComponents(cfg) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_CFG_EDIT).setLabel("Modifier").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_CFG_TOGGLE_MAINT).setLabel(cfg.maintenance ? "Maintenance: ON" : "Maintenance: OFF").setEmoji("🧯").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_PANEL_HOME).setLabel("Retour").setEmoji("⬅️").setStyle(ButtonStyle.Secondary),
  );
  return [row];
}

module.exports = {
  buildHomeEmbed,
  buildHomeComponents,
  buildModEmbed,
  buildModComponents,
  buildAnnounceEmbed,
  buildAnnouncePreviewEmbed,
  buildAnnounceComponents,
  buildConfigEmbed,
  buildConfigComponents,
};
