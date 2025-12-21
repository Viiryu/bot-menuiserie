// part2/staff/staffComponents.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  ChannelType,
} = require("discord.js");

const { STAFF_IDS } = require("./ids");
const { buildStaffPanelPayload } = require("./staffPanel");
const { getGuildConfig, patchGuildConfig } = require("../config/configStore");
const { logEvent } = require("../utils/logging");
const { isStaff } = require("../permissions");

const { publishTicketPanel, handleTicketButton } = require("../modules/tickets");
const { publishApplicationPanel, handleApplicationInteraction } = require("../modules/applications");
const { publishSuggestionPanel, handleSuggestionInteraction } = require("../modules/suggestions");
const autoresp = require("../modules/autoresponses");

// ----- small utils -----
function clamp(s, n) {
  const str = String(s ?? "");
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function iconUrl(client) {
  try {
    return client.user?.displayAvatarURL?.() || null;
  } catch {
    return null;
  }
}

function fmtId(id) {
  return id ? `<#${id}>` : "—";
}
function fmtRole(id) {
  return id ? `<@&${id}>` : "—";
}

// ----- Pending actions (publish/config) -----
const _pending = new Map(); // userId -> { type, key }

function setPending(userId, ctx) {
  _pending.set(userId, { ...ctx, ts: Date.now() });
}
function getPending(userId) {
  const p = _pending.get(userId);
  if (!p) return null;
  if (Date.now() - p.ts > 5 * 60_000) {
    _pending.delete(userId);
    return null;
  }
  return p;
}
function clearPending(userId) {
  _pending.delete(userId);
}

// ----- Embeds / UIs -----
function buildHelpEmbed(client) {
  const e = new EmbedBuilder()
    .setColor(0x111827)
    .setTitle("📖 Aide — Panel Staff")
    .setDescription(
      [
        "• **Panels publics** : publie des messages avec boutons (tickets / candidatures / suggestions)",
        "• **Configuration** : choisis les salons & rôles sans taper d’IDs",
        "• **Auto-réponses** : réponses auto sur mots-clés (anti-spam intégré)",
        "• **Outils salon** : lock/unlock/slowmode",
        "• **Modération** : warn/timeout/purge (rapide, loggé)",
      ].join("\n")
    )
    .setTimestamp(new Date());
  const icon = iconUrl(client);
  if (icon) e.setThumbnail(icon);
  return e;
}

function buildPanelsEmbed(client) {
  const e = new EmbedBuilder()
    .setColor(0x111827)
    .setTitle("📌 Panels publics")
    .setDescription("Choisis ce que tu veux publier, puis sélectionne le salon cible.")
    .addFields(
      { name: "🎫 Tickets", value: "Bouton « Ouvrir un ticket »", inline: true },
      { name: "📝 Candidatures", value: "Bouton « Candidater » + modal", inline: true },
      { name: "💡 Suggestions", value: "Bouton « Proposer » + votes 👍/👎", inline: true },
    )
    .setTimestamp(new Date());
  const icon = iconUrl(client);
  if (icon) e.setThumbnail(icon);
  return e;
}

function buildPanelsComponents() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_PUB_TICKETS).setLabel("Publier Tickets").setEmoji("🎫").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_PUB_APPS).setLabel("Publier Candidatures").setEmoji("📝").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_PUB_SUGG).setLabel("Publier Suggestions").setEmoji("💡").setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("LGW_STAFF:BACK_MAIN").setLabel("Retour").setEmoji("↩️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_CLOSE).setLabel("Fermer").setEmoji("✖️").setStyle(ButtonStyle.Danger),
  );
  return [row1, row2];
}

function buildChannelPickUI(label, channelTypes, pendingCtx) {
  const row = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`${STAFF_IDS.SEL_CHANNEL}:${pendingCtx}`)
      .setPlaceholder(label)
      .setMinValues(1)
      .setMaxValues(1)
      .setChannelTypes(channelTypes)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("LGW_STAFF:BACK_MAIN").setLabel("Retour").setEmoji("↩️").setStyle(ButtonStyle.Secondary)
  );
  return [row, row2];
}

function buildRolePickUI(label, pendingCtx) {
  const row = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`${STAFF_IDS.SEL_ROLE}:${pendingCtx}`)
      .setPlaceholder(label)
      .setMinValues(0)
      .setMaxValues(10)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("LGW_STAFF:BACK_MAIN").setLabel("Retour").setEmoji("↩️").setStyle(ButtonStyle.Secondary)
  );
  return [row, row2];
}

function buildConfigEmbed(client, guild) {
  const cfg = getGuildConfig(guild.id);
  const e = new EmbedBuilder()
    .setColor(0x111827)
    .setTitle("⚙️ Configuration")
    .setDescription("Clique un bouton pour définir une valeur (menus de sélection).")
    .addFields(
      { name: "🧾 Logs", value: fmtId(cfg.logChannelId), inline: true },
      { name: "🎫 Catégorie Tickets", value: cfg.ticketCategoryId ? `\`${cfg.ticketCategoryId}\`` : "—", inline: true },
      { name: "🎫 Logs Tickets", value: fmtId(cfg.ticketLogsChannelId), inline: true },
      { name: "📝 Review Candidatures", value: fmtId(cfg.applicationReviewChannelId), inline: true },
      { name: "💡 Suggestions", value: fmtId(cfg.suggestionsChannelId), inline: true },
      { name: "👋 Welcome", value: fmtId(cfg.welcomeChannelId), inline: true },
      { name: "👋 Leave", value: fmtId(cfg.leaveChannelId), inline: true },
      { name: "🛡️ Rôles Staff", value: (cfg.staffRoleIds || []).length ? (cfg.staffRoleIds.map(fmtRole).join(" ") || "—") : "—", inline: false },
      { name: "🧑‍🏭 Rôle à donner si candidature acceptée", value: cfg.applicationApprovedRoleId ? fmtRole(cfg.applicationApprovedRoleId) : "—", inline: false },
    )
    .setFooter({ text: "Variables templates: {user} {server} {memberCount}" })
    .setTimestamp(new Date());

  const icon = iconUrl(client);
  if (icon) e.setThumbnail(icon);
  return e;
}

function buildConfigButtons() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(STAFF_IDS.CFG_SET_LOGS).setLabel("Logs").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.CFG_SET_TICKET_CAT).setLabel("Cat. Tickets").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.CFG_SET_TICKET_LOGS).setLabel("Logs Tickets").setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(STAFF_IDS.CFG_SET_APPS_REVIEW).setLabel("Review Apps").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.CFG_SET_SUGG_CH).setLabel("Suggestions").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.CFG_SET_STAFF_ROLES).setLabel("Rôles Staff").setStyle(ButtonStyle.Primary),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(STAFF_IDS.CFG_SET_WELCOME).setLabel("Welcome").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.CFG_SET_LEAVE).setLabel("Leave").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.CFG_SET_APP_ROLE).setLabel("Role App ✅").setStyle(ButtonStyle.Secondary),
  );
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(STAFF_IDS.CFG_EDIT_WELCOME_TEXT).setLabel("Texte Welcome").setEmoji("✍️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.CFG_EDIT_LEAVE_TEXT).setLabel("Texte Leave").setEmoji("✍️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("LGW_STAFF:BACK_MAIN").setLabel("Retour").setEmoji("↩️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_CLOSE).setLabel("Fermer").setEmoji("✖️").setStyle(ButtonStyle.Danger),
  );
  return [row1, row2, row3, row4];
}

function buildChannelToolsEmbed() {
  return new EmbedBuilder()
    .setColor(0x111827)
    .setTitle("🧰 Outils salon")
    .setDescription("Actions rapides sur le salon actuel.")
    .addFields(
      { name: "🔒 Lock", value: "Empêche @everyone d’écrire (sauf staff).", inline: true },
      { name: "🔓 Unlock", value: "Restaure l’écriture.", inline: true },
      { name: "🐢 Slowmode", value: "Définit un délai (en secondes).", inline: true },
    )
    .setTimestamp(new Date());
}

function buildChannelToolsComponents() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(STAFF_IDS.CH_LOCK).setLabel("Lock").setEmoji("🔒").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(STAFF_IDS.CH_UNLOCK).setLabel("Unlock").setEmoji("🔓").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(STAFF_IDS.CH_SLOWMODE).setLabel("Slowmode").setEmoji("🐢").setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("LGW_STAFF:BACK_MAIN").setLabel("Retour").setEmoji("↩️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_CLOSE).setLabel("Fermer").setEmoji("✖️").setStyle(ButtonStyle.Danger),
  );
  return [row1, row2];
}

function buildModerationEmbed() {
  return new EmbedBuilder()
    .setColor(0x111827)
    .setTitle("🛡️ Modération")
    .setDescription("Actions rapides (modals).")
    .addFields(
      { name: "⚠️ Warn", value: "DM + log (raison).", inline: true },
      { name: "⏳ Timeout", value: "Durée + raison.", inline: true },
      { name: "🧹 Purge", value: "Supprime X messages.", inline: true },
    )
    .setTimestamp(new Date());
}

function buildModerationComponents() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(STAFF_IDS.MOD_WARN).setLabel("Warn").setEmoji("⚠️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.MOD_TIMEOUT).setLabel("Timeout").setEmoji("⏳").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.MOD_UNTIMEOUT).setLabel("Un-timeout").setEmoji("✅").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.MOD_PURGE).setLabel("Purge").setEmoji("🧹").setStyle(ButtonStyle.Danger),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("LGW_STAFF:BACK_MAIN").setLabel("Retour").setEmoji("↩️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_CLOSE).setLabel("Fermer").setEmoji("✖️").setStyle(ButtonStyle.Danger),
  );
  return [row1, row2];
}

function buildAutorespEmbed(guildId) {
  const items = autoresp.list(guildId);
  const lines = items.slice(0, 10).map((x) => `• \`${clamp(x.trigger, 30)}\` → ${clamp(x.response, 80)}`);
  return new EmbedBuilder()
    .setColor(0x111827)
    .setTitle("🤖 Auto-réponses")
    .setDescription(lines.length ? lines.join("\n") : "Aucune auto-réponse configurée.")
    .setFooter({ text: `Total: ${items.length} • Anti-spam: 12s / trigger / salon` })
    .setTimestamp(new Date());
}

function buildAutorespComponents() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(STAFF_IDS.AR_LIST).setLabel("Refresh").setEmoji("🔄").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.AR_ADD).setLabel("Ajouter").setEmoji("➕").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(STAFF_IDS.AR_REMOVE).setLabel("Supprimer").setEmoji("➖").setStyle(ButtonStyle.Danger),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("LGW_STAFF:BACK_MAIN").setLabel("Retour").setEmoji("↩️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_CLOSE).setLabel("Fermer").setEmoji("✖️").setStyle(ButtonStyle.Danger),
  );
  return [row1, row2];
}

function modalWelcomeEdit(current) {
  const modal = new ModalBuilder().setCustomId(STAFF_IDS.MODAL_WELCOME).setTitle("✍️ Texte Welcome");
  const input = new TextInputBuilder()
    .setCustomId("text")
    .setLabel("Template (utilise {user} {server} {memberCount})")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1800)
    .setValue(String(current || "").slice(0, 1800));
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}
function modalLeaveEdit(current) {
  const modal = new ModalBuilder().setCustomId(STAFF_IDS.MODAL_LEAVE).setTitle("✍️ Texte Leave");
  const input = new TextInputBuilder()
    .setCustomId("text")
    .setLabel("Template (utilise {user} {server} {memberCount})")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1800)
    .setValue(String(current || "").slice(0, 1800));
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function modalWarn() {
  const modal = new ModalBuilder().setCustomId(STAFF_IDS.MODAL_WARN).setTitle("⚠️ Warn");
  const userId = new TextInputBuilder().setCustomId("userId").setLabel("User ID (ou mention)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40);
  const reason = new TextInputBuilder().setCustomId("reason").setLabel("Raison").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900);
  modal.addComponents(new ActionRowBuilder().addComponents(userId), new ActionRowBuilder().addComponents(reason));
  return modal;
}
function modalTimeout() {
  const modal = new ModalBuilder().setCustomId(STAFF_IDS.MODAL_TIMEOUT).setTitle("⏳ Timeout");
  const userId = new TextInputBuilder().setCustomId("userId").setLabel("User ID (ou mention)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40);
  const duration = new TextInputBuilder().setCustomId("duration").setLabel("Durée (ex: 10m, 2h, 1d)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(12);
  const reason = new TextInputBuilder().setCustomId("reason").setLabel("Raison").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900);
  modal.addComponents(new ActionRowBuilder().addComponents(userId), new ActionRowBuilder().addComponents(duration), new ActionRowBuilder().addComponents(reason));
  return modal;
}
function modalPurge() {
  const modal = new ModalBuilder().setCustomId(STAFF_IDS.MODAL_PURGE).setTitle("🧹 Purge");
  const count = new TextInputBuilder().setCustomId("count").setLabel("Nombre de messages (1-100)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3);
  modal.addComponents(new ActionRowBuilder().addComponents(count));
  return modal;
}
function modalSlowmode() {
  const modal = new ModalBuilder().setCustomId(STAFF_IDS.MODAL_SLOWMODE).setTitle("🐢 Slowmode");
  const seconds = new TextInputBuilder().setCustomId("seconds").setLabel("Secondes (0-21600)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(5);
  modal.addComponents(new ActionRowBuilder().addComponents(seconds));
  return modal;
}
function modalAutorespAdd() {
  const modal = new ModalBuilder().setCustomId(STAFF_IDS.MODAL_AR_ADD).setTitle("➕ Auto-réponse — Ajouter");
  const trig = new TextInputBuilder().setCustomId("trigger").setLabel("Trigger (mot-clé)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60);
  const resp = new TextInputBuilder().setCustomId("response").setLabel("Réponse").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500);
  modal.addComponents(new ActionRowBuilder().addComponents(trig), new ActionRowBuilder().addComponents(resp));
  return modal;
}
function modalAutorespRemove() {
  const modal = new ModalBuilder().setCustomId(STAFF_IDS.MODAL_AR_REMOVE).setTitle("➖ Auto-réponse — Supprimer");
  const trig = new TextInputBuilder().setCustomId("trigger").setLabel("Trigger exact à supprimer").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60);
  modal.addComponents(new ActionRowBuilder().addComponents(trig));
  return modal;
}

// Parse duration like 10m 2h 1d
function parseDurationToMs(s) {
  const str = String(s || "").trim().toLowerCase();
  const m = str.match(/^(\d+)(s|m|h|d)$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  if (!Number.isFinite(n) || n <= 0) return null;
  const mult = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return n * mult;
}
function parseUserId(input) {
  const m = String(input || "").match(/(\d{10,})/);
  return m ? m[1] : null;
}

// ----- main handler -----
async function handleStaffInteraction(interaction) {
  try {
  const guild = interaction.guild;
  if (!guild) return false;

  // Route module interactions first (tickets/apps/sugg)
  if (interaction.isButton()) {
    if ([require("../modules/ids").TICKET_IDS.OPEN, require("../modules/ids").TICKET_IDS.CLOSE].includes(interaction.customId)) {
      await handleTicketButton(interaction, { isStaffFn: isStaff });
      return true;
    }
    if (interaction.customId === require("../modules/ids").APP_IDS.OPEN || interaction.customId.startsWith(require("../modules/ids").APP_IDS.APPROVE) || interaction.customId.startsWith(require("../modules/ids").APP_IDS.REJECT)) {
      await handleApplicationInteraction(interaction, { isStaffFn: isStaff });
      return true;
    }
    if (interaction.customId === require("../modules/ids").SUGG_IDS.OPEN) {
      await handleSuggestionInteraction(interaction);
      return true;
    }
  }
  if (interaction.isModalSubmit()) {
    if (interaction.customId === require("../modules/ids").APP_IDS.MODAL) {
      await handleApplicationInteraction(interaction, { isStaffFn: isStaff });
      return true;
    }
    if (interaction.customId === require("../modules/ids").SUGG_IDS.MODAL) {
      await handleSuggestionInteraction(interaction);
      return true;
    }
  }

  // Staff UI interactions
  const isButton = interaction.isButton?.();
  const isSelect = interaction.isAnySelectMenu?.();
  const isModal = interaction.isModalSubmit?.();

  const cid = interaction.customId || "";

  const staffOnlyIds = [
    ...Object.values(STAFF_IDS),
    "LGW_STAFF:BACK_MAIN",
  ];

  const isStaffUi = staffOnlyIds.some((p) => cid.startsWith(p));
  if (!isStaffUi) return false;

  const staff = await isStaff(interaction.member);
  if (!staff) {
    const msg = "⛔ Staff uniquement.";
    if (interaction.deferred || interaction.replied) await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    else await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    return true;
  }

  // Back / Close
  if (isButton && cid === "LGW_STAFF:BACK_MAIN") {
    return interaction.update(buildStaffPanelPayload(interaction.client, guild));
  }
  if (isButton && cid === STAFF_IDS.BTN_CLOSE) {
    return interaction.update({ content: "✅ Fermé.", embeds: [], components: [] });
  }

  // Main panel buttons
  if (isButton && cid === STAFF_IDS.BTN_HELP) {
    return interaction.update({ embeds: [buildHelpEmbed(interaction.client)], components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("LGW_STAFF:BACK_MAIN").setLabel("Retour").setEmoji("↩️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(STAFF_IDS.BTN_CLOSE).setLabel("Fermer").setEmoji("✖️").setStyle(ButtonStyle.Danger),
      ),
    ]});
  }

  if (isButton && cid === STAFF_IDS.BTN_PANELS) {
    return interaction.update({ embeds: [buildPanelsEmbed(interaction.client)], components: buildPanelsComponents() });
  }

  if (isButton && cid === STAFF_IDS.BTN_CONFIG) {
    return interaction.update({ embeds: [buildConfigEmbed(interaction.client, guild)], components: buildConfigButtons() });
  }

  if (isButton && cid === STAFF_IDS.BTN_CHAN_TOOLS) {
    return interaction.update({ embeds: [buildChannelToolsEmbed()], components: buildChannelToolsComponents() });
  }

  if (isButton && cid === STAFF_IDS.BTN_MOD) {
    return interaction.update({ embeds: [buildModerationEmbed()], components: buildModerationComponents() });
  }

  if (isButton && cid === STAFF_IDS.BTN_AUTORESP) {
    return interaction.update({ embeds: [buildAutorespEmbed(guild.id)], components: buildAutorespComponents() });
  }

  // Panels publish buttons => show channel picker
  if (isButton && (cid === STAFF_IDS.BTN_PUB_TICKETS || cid === STAFF_IDS.BTN_PUB_APPS || cid === STAFF_IDS.BTN_PUB_SUGG)) {
    const kind = cid === STAFF_IDS.BTN_PUB_TICKETS ? "tickets" : cid === STAFF_IDS.BTN_PUB_APPS ? "apps" : "sugg";
    setPending(interaction.user.id, { type: "publish", kind });
    const components = buildChannelPickUI("Choisis le salon où publier", [ChannelType.GuildText, ChannelType.GuildAnnouncement], `publish:${kind}`);
    return interaction.update({ embeds: [new EmbedBuilder().setColor(0x111827).setTitle("📌 Choix du salon").setDescription("Sélectionne le salon cible.")], components });
  }

  // Config buttons => show picker or modal
  if (isButton && cid === STAFF_IDS.CFG_SET_LOGS) {
    setPending(interaction.user.id, { type: "config", key: "logChannelId" });
    return interaction.update({ embeds: [new EmbedBuilder().setColor(0x111827).setTitle("🧾 Logs").setDescription("Sélectionne le salon logs.")], components: buildChannelPickUI("Salon logs", [ChannelType.GuildText, ChannelType.GuildAnnouncement], "config:logChannelId") });
  }
  if (isButton && cid === STAFF_IDS.CFG_SET_TICKET_CAT) {
    setPending(interaction.user.id, { type: "config", key: "ticketCategoryId" });
    return interaction.update({ embeds: [new EmbedBuilder().setColor(0x111827).setTitle("🎫 Catégorie Tickets").setDescription("Sélectionne la catégorie tickets.")], components: buildChannelPickUI("Catégorie tickets", [ChannelType.GuildCategory], "config:ticketCategoryId") });
  }
  if (isButton && cid === STAFF_IDS.CFG_SET_TICKET_LOGS) {
    setPending(interaction.user.id, { type: "config", key: "ticketLogsChannelId" });
    return interaction.update({ embeds: [new EmbedBuilder().setColor(0x111827).setTitle("🎫 Logs Tickets").setDescription("Sélectionne le salon où log les tickets.")], components: buildChannelPickUI("Salon logs tickets", [ChannelType.GuildText, ChannelType.GuildAnnouncement], "config:ticketLogsChannelId") });
  }
  if (isButton && cid === STAFF_IDS.CFG_SET_APPS_REVIEW) {
    setPending(interaction.user.id, { type: "config", key: "applicationReviewChannelId" });
    return interaction.update({ embeds: [new EmbedBuilder().setColor(0x111827).setTitle("📝 Review Candidatures").setDescription("Sélectionne le salon review.")], components: buildChannelPickUI("Salon review", [ChannelType.GuildText, ChannelType.GuildAnnouncement], "config:applicationReviewChannelId") });
  }
  if (isButton && cid === STAFF_IDS.CFG_SET_SUGG_CH) {
    setPending(interaction.user.id, { type: "config", key: "suggestionsChannelId" });
    return interaction.update({ embeds: [new EmbedBuilder().setColor(0x111827).setTitle("💡 Suggestions").setDescription("Sélectionne le salon suggestions.")], components: buildChannelPickUI("Salon suggestions", [ChannelType.GuildText, ChannelType.GuildAnnouncement], "config:suggestionsChannelId") });
  }
  if (isButton && cid === STAFF_IDS.CFG_SET_WELCOME) {
    setPending(interaction.user.id, { type: "config", key: "welcomeChannelId" });
    return interaction.update({ embeds: [new EmbedBuilder().setColor(0x111827).setTitle("👋 Welcome").setDescription("Sélectionne le salon welcome.")], components: buildChannelPickUI("Salon welcome", [ChannelType.GuildText, ChannelType.GuildAnnouncement], "config:welcomeChannelId") });
  }
  if (isButton && cid === STAFF_IDS.CFG_SET_LEAVE) {
    setPending(interaction.user.id, { type: "config", key: "leaveChannelId" });
    return interaction.update({ embeds: [new EmbedBuilder().setColor(0x111827).setTitle("👋 Leave").setDescription("Sélectionne le salon leave.")], components: buildChannelPickUI("Salon leave", [ChannelType.GuildText, ChannelType.GuildAnnouncement], "config:leaveChannelId") });
  }
  if (isButton && cid === STAFF_IDS.CFG_SET_STAFF_ROLES) {
    setPending(interaction.user.id, { type: "config", key: "staffRoleIds" });
    return interaction.update({ embeds: [new EmbedBuilder().setColor(0x111827).setTitle("🛡️ Rôles Staff").setDescription("Sélectionne 0-10 rôles staff (Admin passe toujours).")], components: buildRolePickUI("Choisir rôles staff", "config:staffRoleIds") });
  }
  if (isButton && cid === STAFF_IDS.CFG_SET_APP_ROLE) {
    setPending(interaction.user.id, { type: "config", key: "applicationApprovedRoleId" });
    return interaction.update({ embeds: [new EmbedBuilder().setColor(0x111827).setTitle("🧑‍🏭 Rôle App ✅").setDescription("Sélectionne le rôle à donner si candidature acceptée.")], components: buildRolePickUI("Choisir rôle", "config:applicationApprovedRoleId_one") });
  }
  if (isButton && cid === STAFF_IDS.CFG_EDIT_WELCOME_TEXT) {
    const cfg = getGuildConfig(guild.id);
    return interaction.showModal(modalWelcomeEdit(cfg.welcomeTemplate));
  }
  if (isButton && cid === STAFF_IDS.CFG_EDIT_LEAVE_TEXT) {
    const cfg = getGuildConfig(guild.id);
    return interaction.showModal(modalLeaveEdit(cfg.leaveTemplate));
  }

  // Channel tools
  if (isButton && (cid === STAFF_IDS.CH_LOCK || cid === STAFF_IDS.CH_UNLOCK)) {
    const channel = interaction.channel;
    if (!channel?.isTextBased?.()) return interaction.reply({ content: "❌ Salon invalide.", ephemeral: true });

    const allow = cid === STAFF_IDS.CH_UNLOCK;
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: allow ? null : false }).catch(() => {});
    await logEvent(interaction.client, guild.id, "info", "channel_tools", allow ? "unlock" : "lock", `Salon ${channel.id}`, {
      actor: `${interaction.user.tag} (${interaction.user.id})`,
    });
    return interaction.reply({ content: allow ? "✅ Salon déverrouillé." : "🔒 Salon verrouillé.", ephemeral: true });
  }

  if (isButton && cid === STAFF_IDS.CH_SLOWMODE) {
    return interaction.showModal(modalSlowmode());
  }

  // Moderation
  if (isButton && cid === STAFF_IDS.MOD_WARN) return interaction.showModal(modalWarn());
  if (isButton && cid === STAFF_IDS.MOD_TIMEOUT) return interaction.showModal(modalTimeout());
  if (isButton && cid === STAFF_IDS.MOD_UNTIMEOUT) {
    // quick modal reuse: timeout with duration=0? We'll do warn modal style
    const modal = new ModalBuilder().setCustomId("LGW_STAFF:MODAL_UNTIMEOUT").setTitle("✅ Un-timeout");
    const userId = new TextInputBuilder().setCustomId("userId").setLabel("User ID (ou mention)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40);
    modal.addComponents(new ActionRowBuilder().addComponents(userId));
    return interaction.showModal(modal);
  }
  if (isButton && cid === STAFF_IDS.MOD_PURGE) return interaction.showModal(modalPurge());

  // Autoresponses UI
  if (isButton && cid === STAFF_IDS.AR_LIST) {
    return interaction.update({ embeds: [buildAutorespEmbed(guild.id)], components: buildAutorespComponents() });
  }
  if (isButton && cid === STAFF_IDS.AR_ADD) return interaction.showModal(modalAutorespAdd());
  if (isButton && cid === STAFF_IDS.AR_REMOVE) return interaction.showModal(modalAutorespRemove());

  // Select menus (publish/config)
  if (isSelect && cid.startsWith(`${STAFF_IDS.SEL_CHANNEL}:`)) {
    const ctx = cid.split(":").slice(2).join(":"); // after SEL_CHANNEL
    const val = interaction.values?.[0];
    if (!val) return interaction.reply({ content: "❌ Aucun choix.", ephemeral: true });

    // publish or config
    if (ctx.startsWith("publish:")) {
      const kind = ctx.split(":")[1];
      const ch = await interaction.client.channels.fetch(val).catch(() => null);
      if (!ch?.isTextBased?.()) return interaction.reply({ content: "❌ Salon cible invalide.", ephemeral: true });

      if (kind === "tickets") await publishTicketPanel({ client: interaction.client, channel: ch });
      if (kind === "apps") await publishApplicationPanel({ client: interaction.client, channel: ch });
      if (kind === "sugg") await publishSuggestionPanel({ client: interaction.client, channel: ch });

      await logEvent(interaction.client, guild.id, "info", "panels", "publish", `Panel publié (${kind})`, {
        actor: `${interaction.user.tag} (${interaction.user.id})`,
        channelId: ch.id,
      });

      clearPending(interaction.user.id);
      return interaction.update({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle("✅ Publié").setDescription(`Panel **${kind}** publié dans ${ch}.`)], components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("LGW_STAFF:BACK_MAIN").setLabel("Retour").setEmoji("↩️").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(STAFF_IDS.BTN_CLOSE).setLabel("Fermer").setEmoji("✖️").setStyle(ButtonStyle.Danger),
        ),
      ] });
    }

    if (ctx.startsWith("config:")) {
      const key = ctx.split(":")[1];
      patchGuildConfig(guild.id, { [key]: val });
      await logEvent(interaction.client, guild.id, "info", "config", "set", `${key}=${val}`, {
        actor: `${interaction.user.tag} (${interaction.user.id})`,
      });
      clearPending(interaction.user.id);
      return interaction.update({ embeds: [buildConfigEmbed(interaction.client, guild)], components: buildConfigButtons() });
    }

    return;
  }

  if (isSelect && cid.startsWith(`${STAFF_IDS.SEL_ROLE}:`)) {
    const ctx = cid.split(":").slice(2).join(":");
    const values = interaction.values || [];

    if (ctx === "config:staffRoleIds") {
      patchGuildConfig(guild.id, { staffRoleIds: values });
      await logEvent(interaction.client, guild.id, "info", "config", "set_staff_roles", `roles=${values.join(",")}`, {
        actor: `${interaction.user.tag} (${interaction.user.id})`,
      });
      clearPending(interaction.user.id);
      return interaction.update({ embeds: [buildConfigEmbed(interaction.client, guild)], components: buildConfigButtons() });
    }

    if (ctx === "config:applicationApprovedRoleId_one") {
      const roleId = values[0] || "";
      patchGuildConfig(guild.id, { applicationApprovedRoleId: roleId });
      await logEvent(interaction.client, guild.id, "info", "config", "set_app_role", `role=${roleId}`, {
        actor: `${interaction.user.tag} (${interaction.user.id})`,
      });
      clearPending(interaction.user.id);
      return interaction.update({ embeds: [buildConfigEmbed(interaction.client, guild)], components: buildConfigButtons() });
    }

    return;
  }

  // Modals: config text
  if (isModal && cid === STAFF_IDS.MODAL_WELCOME) {
    const txt = interaction.fields.getTextInputValue("text");
    patchGuildConfig(guild.id, { welcomeTemplate: txt });
    await logEvent(interaction.client, guild.id, "info", "config", "welcome_template", "Template welcome mis à jour.", {
      actor: `${interaction.user.tag} (${interaction.user.id})`,
    });
    return interaction.reply({ content: "✅ Texte welcome mis à jour.", ephemeral: true });
  }

  if (isModal && cid === STAFF_IDS.MODAL_LEAVE) {
    const txt = interaction.fields.getTextInputValue("text");
    patchGuildConfig(guild.id, { leaveTemplate: txt });
    await logEvent(interaction.client, guild.id, "info", "config", "leave_template", "Template leave mis à jour.", {
      actor: `${interaction.user.tag} (${interaction.user.id})`,
    });
    return interaction.reply({ content: "✅ Texte leave mis à jour.", ephemeral: true });
  }

  // Modals: channel tools slowmode
  if (isModal && cid === STAFF_IDS.MODAL_SLOWMODE) {
    const seconds = Number(interaction.fields.getTextInputValue("seconds"));
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 21600) {
      return interaction.reply({ content: "❌ Valeur invalide (0-21600).", ephemeral: true });
    }
    const channel = interaction.channel;
    if (!channel?.isTextBased?.()) return interaction.reply({ content: "❌ Salon invalide.", ephemeral: true });
    await channel.setRateLimitPerUser(seconds).catch(() => {});
    await logEvent(interaction.client, guild.id, "info", "channel_tools", "slowmode", `seconds=${seconds}`, {
      actor: `${interaction.user.tag} (${interaction.user.id})`,
      channelId: channel.id,
    });
    return interaction.reply({ content: `✅ Slowmode défini à **${seconds}s**.`, ephemeral: true });
  }

  // Modals: moderation
  if (isModal && cid === STAFF_IDS.MODAL_WARN) {
    await interaction.deferReply({ ephemeral: true });
    const userId = parseUserId(interaction.fields.getTextInputValue("userId"));
    const reason = interaction.fields.getTextInputValue("reason");

    if (!userId) return interaction.editReply("❌ User ID invalide.");
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return interaction.editReply("❌ Membre introuvable.");

    member.send(`⚠️ **Warn** sur **${guild.name}**\nRaison: ${reason}`).catch(() => {});
    await logEvent(interaction.client, guild.id, "warn", "moderation", "warn", `warn ${userId}`, {
      actor: `${interaction.user.tag} (${interaction.user.id})`,
      reason: clamp(reason, 500),
    });
    return interaction.editReply(`✅ Warn envoyé à ${member.user.tag}.`);
  }

  if (isModal && cid === STAFF_IDS.MODAL_TIMEOUT) {
    await interaction.deferReply({ ephemeral: true });
    const userId = parseUserId(interaction.fields.getTextInputValue("userId"));
    const durationStr = interaction.fields.getTextInputValue("duration");
    const reason = interaction.fields.getTextInputValue("reason");
    const ms = parseDurationToMs(durationStr);

    if (!userId) return interaction.editReply("❌ User ID invalide.");
    if (!ms) return interaction.editReply("❌ Durée invalide (ex: 10m, 2h, 1d).");

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return interaction.editReply("❌ Membre introuvable.");

    await member.timeout(ms, reason).catch(() => {});
    await logEvent(interaction.client, guild.id, "warn", "moderation", "timeout", `timeout ${userId} ${durationStr}`, {
      actor: `${interaction.user.tag} (${interaction.user.id})`,
      reason: clamp(reason, 500),
    });
    return interaction.editReply(`✅ Timeout appliqué à ${member.user.tag} (${durationStr}).`);
  }

  if (isModal && cid === "LGW_STAFF:MODAL_UNTIMEOUT") {
    await interaction.deferReply({ ephemeral: true });
    const userId = parseUserId(interaction.fields.getTextInputValue("userId"));
    if (!userId) return interaction.editReply("❌ User ID invalide.");
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return interaction.editReply("❌ Membre introuvable.");
    await member.timeout(null).catch(() => {});
    await logEvent(interaction.client, guild.id, "info", "moderation", "untimeout", `untimeout ${userId}`, {
      actor: `${interaction.user.tag} (${interaction.user.id})`,
    });
    return interaction.editReply(`✅ Timeout retiré pour ${member.user.tag}.`);
  }

  if (isModal && cid === STAFF_IDS.MODAL_PURGE) {
    await interaction.deferReply({ ephemeral: true });
    const count = Number(interaction.fields.getTextInputValue("count"));
    if (!Number.isFinite(count) || count < 1 || count > 100) return interaction.editReply("❌ Valeur invalide (1-100).");
    const channel = interaction.channel;
    if (!channel?.isTextBased?.()) return interaction.editReply("❌ Salon invalide.");
    const deleted = await channel.bulkDelete(count, true).catch(() => null);
    await logEvent(interaction.client, guild.id, "warn", "moderation", "purge", `purge ${count}`, {
      actor: `${interaction.user.tag} (${interaction.user.id})`,
      channelId: channel.id,
      deleted: deleted ? deleted.size : 0,
    });
    return interaction.editReply(`✅ Purge: ${deleted ? deleted.size : 0} supprimés.`);
  }

  // Modals: autoresponse
  if (isModal && cid === STAFF_IDS.MODAL_AR_ADD) {
    await interaction.deferReply({ ephemeral: true });
    const trig = interaction.fields.getTextInputValue("trigger");
    const resp = interaction.fields.getTextInputValue("response");
    const out = autoresp.add(guild.id, trig, resp, interaction.user.id);
    if (!out.ok) return interaction.editReply(`❌ ${out.error}`);
    await logEvent(interaction.client, guild.id, "info", "autoresponse", "add", `trigger=${trig}`, {
      actor: `${interaction.user.tag} (${interaction.user.id})`,
    });
    return interaction.editReply("✅ Auto-réponse ajoutée.");
  }

  if (isModal && cid === STAFF_IDS.MODAL_AR_REMOVE) {
    await interaction.deferReply({ ephemeral: true });
    const trig = interaction.fields.getTextInputValue("trigger");
    const removed = autoresp.remove(guild.id, trig);
    await logEvent(interaction.client, guild.id, "info", "autoresponse", "remove", `trigger=${trig}`, {
      actor: `${interaction.user.tag} (${interaction.user.id})`,
      removed,
    });
    return interaction.editReply(removed ? "✅ Supprimée." : "⚠️ Aucune auto-réponse trouvée pour ce trigger.");
  }

  return false;
  } catch (e) {
    console.error("[staff] interaction error:", (e && (e.stack || e.message)) || e);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: "❌ Erreur interne (staff). Regarde la console du bot.", flags: 64 }).catch(() => {});
      } else if (interaction.isRepliable && interaction.isRepliable()) {
        await interaction.reply({ content: "❌ Erreur interne (staff). Regarde la console du bot.", flags: 64 }).catch(() => {});
      }
    } catch {}
    return true;
  }
}

module.exports = { handleStaffInteraction };
