// part2/staff/staffModals.js
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlagsBitField,
} = require("discord.js");

const { STAFF_IDS } = require("./ids");
const { isStaff } = require("../permissions");
const { patchGuildConfig } = require("./staffConfigState");
const { getAnnDraft, patchAnnDraft } = require("./staffState");
const { buildAnnounceEmbed, buildAnnouncePreviewEmbed, buildAnnounceComponents, buildConfigEmbed, buildConfigComponents } = require("./staffUI");
const { getGuildConfig } = require("./staffConfigState");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

function buildConfigModal(prefill = {}) {
  const modal = new ModalBuilder()
    .setCustomId(STAFF_IDS.MODAL_CFG)
    .setTitle("Staff — Config");

  const logsChannelId = new TextInputBuilder()
    .setCustomId("logsChannelId")
    .setLabel("Salon logs (ID) — requis")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(32)
    .setValue(prefill.logsChannelId || "");

  const modLogsChannelId = new TextInputBuilder()
    .setCustomId("modLogsChannelId")
    .setLabel("Salon mod logs (ID) — optionnel")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(32)
    .setValue(prefill.modLogsChannelId || "");

  const pingRoleId = new TextInputBuilder()
    .setCustomId("announcePingRoleId")
    .setLabel("Rôle ping annonces (ID) — optionnel")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(32)
    .setValue(prefill.announcePingRoleId || "");

  modal.addComponents(
    new ActionRowBuilder().addComponents(logsChannelId),
    new ActionRowBuilder().addComponents(modLogsChannelId),
    new ActionRowBuilder().addComponents(pingRoleId),
  );

  return modal;
}

function buildSimpleTargetModal(customId, title, placeholderReason = "Raison (optionnel)") {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

  const target = new TextInputBuilder()
    .setCustomId("target")
    .setLabel("Cible (mention ou ID)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(64);

  const reason = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel(placeholderReason)
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);

  modal.addComponents(new ActionRowBuilder().addComponents(target), new ActionRowBuilder().addComponents(reason));
  return modal;
}

function buildTimeoutModal() {
  const modal = new ModalBuilder().setCustomId(STAFF_IDS.MODAL_TIMEOUT).setTitle("⏳ Timeout");

  const target = new TextInputBuilder()
    .setCustomId("target")
    .setLabel("Cible (mention ou ID)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(64);

  const duration = new TextInputBuilder()
    .setCustomId("duration")
    .setLabel("Durée (ex: 10m, 2h, 1d)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(16);

  const reason = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Raison (optionnel)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(target),
    new ActionRowBuilder().addComponents(duration),
    new ActionRowBuilder().addComponents(reason),
  );
  return modal;
}

function buildPurgeModal() {
  const modal = new ModalBuilder().setCustomId(STAFF_IDS.MODAL_PURGE).setTitle("🧹 Purge");

  const amount = new TextInputBuilder()
    .setCustomId("amount")
    .setLabel("Nombre de messages (1-100)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(3);

  const user = new TextInputBuilder()
    .setCustomId("user")
    .setLabel("Filtrer par user (mention/ID) — optionnel")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(64);

  const reason = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Raison (optionnel)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder().addComponents(amount),
    new ActionRowBuilder().addComponents(user),
    new ActionRowBuilder().addComponents(reason),
  );
  return modal;
}

function buildAnnEditModal(prefill = {}) {
  const modal = new ModalBuilder().setCustomId(STAFF_IDS.MODAL_ANN_EDIT).setTitle("📣 Annonce — Édition");

  const company = new TextInputBuilder()
    .setCustomId("company")
    .setLabel("Entreprise (ex: Menuiserie de Strawberry)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(80)
    .setValue(prefill.company || "Menuiserie de Strawberry");

  const pay = new TextInputBuilder()
    .setCustomId("pay")
    .setLabel("Salaire (ex: 17,50$)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(40)
    .setValue(prefill.pay || "17,50$");

  const interval = new TextInputBuilder()
    .setCustomId("interval")
    .setLabel("Intervalle (ex: 20mn)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(40)
    .setValue(prefill.interval || "20mn");

  const contacts = new TextInputBuilder()
    .setCustomId("contacts")
    .setLabel("Contacts (ex: Jonah… | Mya…)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(300)
    .setValue(prefill.contacts || "Jonah CRAWFORD : LGW-7163 | Mya Caldwell : LGW-4348");

  const extra = new TextInputBuilder()
    .setCustomId("extra")
    .setLabel("Extra (optionnel)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000)
    .setValue(prefill.extra || "");

  modal.addComponents(
    new ActionRowBuilder().addComponents(company),
    new ActionRowBuilder().addComponents(pay),
    new ActionRowBuilder().addComponents(interval),
    new ActionRowBuilder().addComponents(contacts),
    new ActionRowBuilder().addComponents(extra),
  );

  return modal;
}

async function handleStaffModals(interaction) {
  if (!interaction.isModalSubmit?.() || !interaction.isModalSubmit()) return false;

  const cid = interaction.customId;
  const handled = [
    STAFF_IDS.MODAL_CFG,
    STAFF_IDS.MODAL_WARN,
    STAFF_IDS.MODAL_TIMEOUT,
    STAFF_IDS.MODAL_KICK,
    STAFF_IDS.MODAL_BAN,
    STAFF_IDS.MODAL_PURGE,
    STAFF_IDS.MODAL_ANN_EDIT,
  ].includes(cid);

  if (!handled) return false;

  try {
    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return true;
    }

    // Config
    if (cid === STAFF_IDS.MODAL_CFG) {
      const logsChannelId = (interaction.fields.getTextInputValue("logsChannelId") || "").trim();
      const modLogsChannelId = (interaction.fields.getTextInputValue("modLogsChannelId") || "").trim();
      const announcePingRoleId = (interaction.fields.getTextInputValue("announcePingRoleId") || "").trim();

      patchGuildConfig(interaction.guildId, {
        logsChannelId: logsChannelId || null,
        modLogsChannelId: modLogsChannelId || null,
        announcePingRoleId: announcePingRoleId || null,
      });

      const cfg = getGuildConfig(interaction.guildId);
      await interaction.reply({
        embeds: [buildConfigEmbed(cfg, "Configuration mise à jour.")],
        components: buildConfigComponents(cfg),
        flags: EPHEMERAL,
      });
      return true;
    }

    // Ann edit
    if (cid === STAFF_IDS.MODAL_ANN_EDIT) {
      const draft = getAnnDraft(interaction.guildId, interaction.user.id);
      if (!draft) {
        await interaction.reply({ content: "❌ Brouillon annonce expiré. Relance /staff panel → Annonces.", flags: EPHEMERAL });
        return true;
      }

      const vars = {
        company: interaction.fields.getTextInputValue("company") || "",
        pay: interaction.fields.getTextInputValue("pay") || "",
        interval: interaction.fields.getTextInputValue("interval") || "",
        contacts: interaction.fields.getTextInputValue("contacts") || "",
        extra: interaction.fields.getTextInputValue("extra") || "",
      };

      const next = patchAnnDraft(interaction.guildId, interaction.user.id, { vars });
      const cfg = getGuildConfig(interaction.guildId);

      await interaction.reply({
        embeds: [buildAnnounceEmbed(cfg, next, "Annonce mise à jour."), buildAnnouncePreviewEmbed(next)],
        components: buildAnnounceComponents(next),
        flags: EPHEMERAL,
      });
      return true;
    }

    // Les modals modération sont gérés dans staffComponents (pour garder un seul pipeline d'exécution).
    // Ici on renvoie juste true pour éviter "non géré" si jamais.
    await interaction.reply({ content: "✅ Reçu. Action en cours…", flags: EPHEMERAL });
    return true;
  } catch (e) {
    console.error("[staffModals] error:", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Erreur interne (Staff Modals).", flags: EPHEMERAL }).catch(() => {});
    }
    return true;
  }
}

module.exports = {
  handleStaffModals,

  buildConfigModal,
  buildSimpleTargetModal,
  buildTimeoutModal,
  buildPurgeModal,
  buildAnnEditModal,
};
