// part2/staff/staffComponents.js
const {
  MessageFlagsBitField,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");

const { STAFF_IDS } = require("./ids");
const { isStaff } = require("../permissions");
const { loadStaffConfig, getGuildConfig, patchGuildConfig } = require("./staffConfigState");
const { setAnnDraft, getAnnDraft, patchAnnDraft, clearAnnDraft, setLogFilter, getLogFilter } = require("./staffState");
const { buildHomeEmbed, buildHomeComponents, buildModEmbed, buildModComponents, buildAnnounceEmbed, buildAnnouncePreviewEmbed, buildAnnounceComponents, buildConfigEmbed, buildConfigComponents } = require("./staffUI");
const { buildConfigModal, buildSimpleTargetModal, buildTimeoutModal, buildPurgeModal, buildAnnEditModal } = require("./staffModals");
const { parseUserId, parseDurationMs, audit } = require("./staffActions");
const fs = require("fs");
const path = require("path");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

const AUDIT_PATH = path.join(__dirname, "..", "logging", "audit.log.jsonl");

function readLastAuditLines(max = 20) {
  try {
    if (!fs.existsSync(AUDIT_PATH)) return [];
    const raw = fs.readFileSync(AUDIT_PATH, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines.slice(-max).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function buildLogsPayload(guildId, filter = "all") {
  const items = readLastAuditLines(30).filter((x) => x.guildId === guildId);
  const filtered = filter === "all" ? items : items.filter((x) => x.module === filter);

  const desc = filtered.length
    ? filtered.slice(-15).reverse().map((x) => {
        const ok = x.ok ? "✅" : "❌";
        const mod = x.module || "—";
        const action = x.action || "—";
        const who = x.userId ? `<@${x.userId}>` : "—";
        const when = x.ts ? new Date(x.ts).toLocaleString("fr-FR") : "";
        const details = (x.details || "").toString().slice(0, 80);
        return `${ok} **${action}** • \`${mod}\` • ${who}\n> ${details} — *${when}*`;
      }).join("\n\n")
    : "—";

  const embed = {
    title: "🧾 Logs — Derniers évènements",
    color: 0xCBA135,
    description: desc,
    footer: { text: `Filtre: ${filter}` },
    timestamp: new Date().toISOString(),
  };

  const select = new StringSelectMenuBuilder()
    .setCustomId(STAFF_IDS.SELECT_LOG_FILTER)
    .setPlaceholder("Filtrer par module…")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      { label: "🌐 Tous", value: "all" },
      { label: "🛡️ Modération", value: "moderation" },
      { label: "📣 Annonces", value: "announce" },
      { label: "⚙️ Config", value: "config" },
    );

  const row0 = new ActionRowBuilder().addComponents(select);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_LOG_REFRESH).setLabel("Rafraîchir").setEmoji("🔄").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(STAFF_IDS.BTN_PANEL_HOME).setLabel("Retour").setEmoji("⬅️").setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row0, row1] };
}

async function handleStaffComponents(interaction) {
  // Channel select for announce
  if (interaction.isChannelSelectMenu?.() && interaction.customId === "P2_STAFF_ANN_CHANNEL") {
    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return true;
    }
    const draft = getAnnDraft(interaction.guildId, interaction.user.id);
    if (!draft) {
      await interaction.reply({ content: "❌ Brouillon annonce expiré.", flags: EPHEMERAL });
      return true;
    }

    const channelId = interaction.values?.[0] || null;
    const next = patchAnnDraft(interaction.guildId, interaction.user.id, { channelId });

    const cfg = getGuildConfig(interaction.guildId);
    await interaction.update({
      embeds: [buildAnnounceEmbed(cfg, next, "Salon cible mis à jour."), buildAnnouncePreviewEmbed(next)],
      components: buildAnnounceComponents(next),
    });
    return true;
  }

  // Log filter select
  if (interaction.isStringSelectMenu?.() && interaction.customId === STAFF_IDS.SELECT_LOG_FILTER) {
    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return true;
    }
    const filter = interaction.values?.[0] || "all";
    setLogFilter(interaction.guildId, interaction.user.id, filter);
    await interaction.update(buildLogsPayload(interaction.guildId, filter));
    return true;
  }

  // Announcement template select
  if (interaction.isStringSelectMenu?.() && interaction.customId === STAFF_IDS.SELECT_ANN_TEMPLATE) {
    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return true;
    }
    const key = interaction.values?.[0];
    const draft = getAnnDraft(interaction.guildId, interaction.user.id);
    if (!draft) {
      await interaction.reply({ content: "❌ Brouillon annonce expiré.", flags: EPHEMERAL });
      return true;
    }
    const next = patchAnnDraft(interaction.guildId, interaction.user.id, { templateKey: key });
    const cfg = getGuildConfig(interaction.guildId);

    await interaction.update({
      embeds: [buildAnnounceEmbed(cfg, next, "Template mis à jour."), buildAnnouncePreviewEmbed(next)],
      components: buildAnnounceComponents(next),
    });
    return true;
  }

  // Buttons
  if (!interaction.isButton?.() || !interaction.isButton()) return false;

  const id = interaction.customId;
  const staffButtonIds = new Set([
    STAFF_IDS.BTN_PANEL_HOME,
    STAFF_IDS.BTN_PANEL_MOD,
    STAFF_IDS.BTN_PANEL_ANN,
    STAFF_IDS.BTN_PANEL_AUTOROLE,
    STAFF_IDS.BTN_PANEL_CONFIG,

    STAFF_IDS.BTN_MOD_WARN,
    STAFF_IDS.BTN_MOD_TIMEOUT,
    STAFF_IDS.BTN_MOD_KICK,
    STAFF_IDS.BTN_MOD_BAN,
    STAFF_IDS.BTN_MOD_PURGE,

    STAFF_IDS.BTN_ANN_EDIT,
    STAFF_IDS.BTN_ANN_PUBLISH,
    STAFF_IDS.BTN_ANN_PUBLISH_SILENT,
    STAFF_IDS.BTN_ANN_PUBLISH_MENTION,
    STAFF_IDS.BTN_ANN_CANCEL,

    STAFF_IDS.BTN_CFG_EDIT,
    STAFF_IDS.BTN_CFG_TOGGLE_MAINT,

    STAFF_IDS.BTN_LOG_REFRESH,
  ]);

  if (!staffButtonIds.has(id)) return false;

  try {
    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return true;
    }

    loadStaffConfig();
    const cfg = getGuildConfig(interaction.guildId);

    // Panels
    if (id === STAFF_IDS.BTN_PANEL_HOME) {
      await interaction.update({ embeds: [buildHomeEmbed(interaction.guild, cfg)], components: buildHomeComponents() });
      return true;
    }

    if (id === STAFF_IDS.BTN_PANEL_MOD) {
      await interaction.update({ embeds: [buildModEmbed(cfg)], components: buildModComponents() });
      return true;
    }

    if (id === STAFF_IDS.BTN_PANEL_CONFIG) {
      await interaction.update({ embeds: [buildConfigEmbed(cfg)], components: buildConfigComponents(cfg) });
      return true;
    }

    if (id === STAFF_IDS.BTN_PANEL_AUTOROLE) {
      await interaction.update({
        embeds: [
          {
            title: "🎭 Auto-rôles",
            color: 0xCBA135,
            description:
              "Le module auto-rôles existe déjà via **/autorole**.\n\n" +
              "➡️ Lance : **/autorole create** pour ouvrir le wizard.\n" +
              "💡 Conseil: mets les rôles auto-rôles sous le rôle du bot.",
            footer: { text: "Auto-rôles — Le Secrétaire" },
            timestamp: new Date().toISOString(),
          },
        ],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(STAFF_IDS.BTN_PANEL_HOME).setLabel("Retour").setEmoji("⬅️").setStyle(ButtonStyle.Secondary)
        )],
      });
      return true;
    }

    if (id === STAFF_IDS.BTN_PANEL_ANN) {
      const draft = setAnnDraft(interaction.guildId, interaction.user.id, {
        templateKey: "recrutement",
        channelId: null,
        vars: {
          company: "Menuiserie de Strawberry",
          pay: "17,50$",
          interval: "20mn",
          contacts: "Jonah CRAWFORD : LGW-7163 | Mya Caldwell : LGW-4348",
          extra: "",
        },
        color: "#CBA135",
        footer: "Annonce — Le Secrétaire",
        meta: { createdAt: Date.now(), updatedAt: Date.now() },
      });

      await interaction.update({
        embeds: [buildAnnounceEmbed(cfg, draft, "Studio prêt."), buildAnnouncePreviewEmbed(draft)],
        components: buildAnnounceComponents(draft),
      });
      return true;
    }

    // Config buttons
    if (id === STAFF_IDS.BTN_CFG_EDIT) {
      const modal = buildConfigModal(cfg);
      await interaction.showModal(modal);
      return true;
    }

    if (id === STAFF_IDS.BTN_CFG_TOGGLE_MAINT) {
      const next = patchGuildConfig(interaction.guildId, { maintenance: !cfg.maintenance });
      await audit(interaction, { module: "config", action: "maintenance.toggle", ok: true, details: `maintenance=${next.maintenance}` });
      await interaction.update({ embeds: [buildConfigEmbed(next, "Maintenance mise à jour.")], components: buildConfigComponents(next) });
      return true;
    }

    // Logs refresh
    if (id === STAFF_IDS.BTN_LOG_REFRESH) {
      const filter = getLogFilter(interaction.guildId, interaction.user.id);
      await interaction.update(buildLogsPayload(interaction.guildId, filter));
      return true;
    }

    // Announcement buttons
    if (id === STAFF_IDS.BTN_ANN_CANCEL) {
      clearAnnDraft(interaction.guildId, interaction.user.id);
      await audit(interaction, { module: "announce", action: "announce.cancel", ok: true, details: "draft cleared" });
      await interaction.update({ embeds: [buildHomeEmbed(interaction.guild, cfg, "Annonce annulée.")], components: buildHomeComponents() });
      return true;
    }

    if (id === STAFF_IDS.BTN_ANN_EDIT) {
      const draft = getAnnDraft(interaction.guildId, interaction.user.id);
      if (!draft) {
        await interaction.reply({ content: "❌ Brouillon annonce expiré.", flags: EPHEMERAL });
        return true;
      }
      await interaction.showModal(buildAnnEditModal(draft.vars || {}));
      return true;
    }

    if (id === STAFF_IDS.BTN_ANN_PUBLISH || id === STAFF_IDS.BTN_ANN_PUBLISH_SILENT || id === STAFF_IDS.BTN_ANN_PUBLISH_MENTION) {
      const draft = getAnnDraft(interaction.guildId, interaction.user.id);
      if (!draft) {
        await interaction.reply({ content: "❌ Brouillon annonce expiré.", flags: EPHEMERAL });
        return true;
      }
      const targetId = draft.channelId || interaction.channelId;
      const channel = await interaction.guild.channels.fetch(targetId).catch(() => null);
      if (!channel || !channel.isTextBased?.()) {
        await interaction.reply({ content: "❌ Salon cible invalide.", flags: EPHEMERAL });
        return true;
      }

      const announceEmbed = buildAnnouncePreviewEmbed(draft);
      const payload = { embeds: [announceEmbed] };

      if (id === STAFF_IDS.BTN_ANN_PUBLISH_SILENT) {
        payload.allowedMentions = { parse: [] };
      }

      if (id === STAFF_IDS.BTN_ANN_PUBLISH_MENTION) {
        if (cfg.announcePingRoleId) {
          payload.content = `<@&${cfg.announcePingRoleId}>`;
          payload.allowedMentions = { roles: [cfg.announcePingRoleId] };
        } else {
          // fallback: no role configured
          payload.content = "🔔 (Aucun rôle ping configuré via /staff config)";
          payload.allowedMentions = { parse: [] };
        }
      }

      const sent = await channel.send(payload);
      await audit(interaction, { module: "announce", action: "announce.publish", ok: true, details: `channel=${channel.id} msg=${sent.id}` });

      await interaction.reply({ content: `✅ Annonce publiée dans <#${channel.id}> (ID: \`${sent.id}\`)`, flags: EPHEMERAL });
      return true;
    }

    // Moderation buttons -> modals
    if (cfg.maintenance) {
      // block sensitive actions
      if ([STAFF_IDS.BTN_MOD_KICK, STAFF_IDS.BTN_MOD_BAN, STAFF_IDS.BTN_MOD_PURGE, STAFF_IDS.BTN_MOD_TIMEOUT].includes(id)) {
        await interaction.reply({ content: "🧯 Maintenance ON : action bloquée.", flags: EPHEMERAL });
        return true;
      }
    }

    if (id === STAFF_IDS.BTN_MOD_WARN) {
      await interaction.showModal(buildSimpleTargetModal(STAFF_IDS.MODAL_WARN, "⚠️ Warn", "Raison du warn (optionnel)"));
      return true;
    }
    if (id === STAFF_IDS.BTN_MOD_KICK) {
      await interaction.showModal(buildSimpleTargetModal(STAFF_IDS.MODAL_KICK, "👢 Kick", "Raison du kick (optionnel)"));
      return true;
    }
    if (id === STAFF_IDS.BTN_MOD_BAN) {
      await interaction.showModal(buildSimpleTargetModal(STAFF_IDS.MODAL_BAN, "🔨 Ban", "Raison du ban (optionnel)"));
      return true;
    }
    if (id === STAFF_IDS.BTN_MOD_TIMEOUT) {
      await interaction.showModal(buildTimeoutModal());
      return true;
    }
    if (id === STAFF_IDS.BTN_MOD_PURGE) {
      await interaction.showModal(buildPurgeModal());
      return true;
    }

    return false;
  } catch (e) {
    console.error("[staffComponents] error:", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Erreur interne (Staff UI).", flags: EPHEMERAL }).catch(() => {});
    }
    return true;
  }
}

module.exports = { handleStaffComponents, buildLogsPayload };
