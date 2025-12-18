const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlagsBitField,
} = require("discord.js");

const { IDS } = require("../constants");
const { parseHexColor, cut } = require("../util");
const { isStaff } = require("../permissions");
const { ensureDraft, getDraft, setDraftMeta, updateDraft, clearDraft } = require("./studioState");
const { addSchedule } = require("../scheduler/schedulerState");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

// Sécurité IDs
const _reqIds = [
  "STUDIO_EDIT_BASIC",
  "STUDIO_EDIT_AUTHOR",
  "STUDIO_EDIT_FOOTER",
  "STUDIO_EDIT_MEDIA",
  "STUDIO_ADD_FIELD",
  "STUDIO_REMOVE_FIELD",
  "STUDIO_TOGGLE_TS",
  "STUDIO_PREVIEW",
  "STUDIO_PUBLISH",
  "STUDIO_CANCEL",
  "STUDIO_BASIC_MODAL",
  "STUDIO_FOOTER_MODAL",
  "STUDIO_AUTHOR_MODAL",
  "STUDIO_MEDIA_MODAL",
  "STUDIO_ADD_FIELD_MODAL",
  "STUDIO_REMOVE_FIELD_MODAL",
];
for (const k of _reqIds) {
  if (!IDS || typeof IDS[k] !== "string") {
    throw new Error(`[EmbedStudio] IDS.${k} manquant dans part2/constants.js`);
  }
}

function buildEmbedFromDraft(d) {
  const e = d.embed;
  const embed = new EmbedBuilder();

  if (e.title) embed.setTitle(e.title);
  if (e.description) embed.setDescription(e.description);

  const color = parseHexColor(e.colorRaw);
  if (color !== null) embed.setColor(color);

  if (e.authorName) embed.setAuthor({ name: e.authorName, iconURL: e.authorIcon || undefined });
  if (e.footerText) embed.setFooter({ text: e.footerText, iconURL: e.footerIcon || undefined });

  if (e.thumbnail) embed.setThumbnail(e.thumbnail);
  if (e.image) embed.setImage(e.image);

  if (e.timestamp) embed.setTimestamp(new Date());

  if (Array.isArray(e.fields) && e.fields.length) {
    embed.setFields(
      e.fields.slice(0, 25).map((f) => ({
        name: cut(f.name || " ", 256),
        value: cut(f.value || " ", 1024),
        inline: !!f.inline,
      }))
    );
  }

  return embed;
}

function draftToPayload(d) {
  // payload complet réutilisable par schedulerRunner
  return { ...d.embed };
}

function studioPanelText(draft) {
  const e = draft.embed;
  const fieldsCount = e.fields?.length || 0;
  const ts = e.timestamp ? "✅ ON" : "❌ OFF";

  const mode = draft.meta?.mode || "publish";
  const sched = draft.meta?.schedule || null;

  const extra =
    mode === "schedule" && sched
      ? [
          "",
          "🗓️ **Mode Planification**",
          `• Salon: <#${sched.channelId}>`,
          `• Toutes les: **${Math.round(sched.everyMs / 60000)} min**`,
          `• Démarre dans: **${Math.round((sched.startDelayMs || 0) / 60000)} min**`,
        ].join("\n")
      : "";

  return (
    [
      "**Embed Studio** (brouillon temporaire en mémoire)",
      `• **Titre**: ${e.title ? "✅" : "—"}`,
      `• **Description**: ${e.description ? "✅" : "—"}`,
      `• **Couleur**: ${e.colorRaw ? `\`${e.colorRaw}\`` : "—"}`,
      `• **Author**: ${e.authorName ? "✅" : "—"}`,
      `• **Footer**: ${e.footerText ? "✅" : "—"}`,
      `• **Image**: ${e.image ? "✅" : "—"} | **Thumbnail**: ${e.thumbnail ? "✅" : "—"}`,
      `• **Fields**: **${fieldsCount}**`,
      `• **Timestamp**: **${ts}**`,
    ].join("\n") + extra
  );
}

function buildStudioRows(draft) {
  const mode = draft?.meta?.mode || "publish";
  const publishLabel = mode === "schedule" ? "🗓️ Planifier" : "📨 Publier";

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(IDS.STUDIO_EDIT_BASIC).setLabel("✏️ Titre/Desc/Couleur").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(IDS.STUDIO_EDIT_AUTHOR).setLabel("👤 Author").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IDS.STUDIO_EDIT_FOOTER).setLabel("🧾 Footer").setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(IDS.STUDIO_EDIT_MEDIA).setLabel("🖼️ Image/Thumb").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IDS.STUDIO_ADD_FIELD).setLabel("➕ Field").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IDS.STUDIO_REMOVE_FIELD).setLabel("➖ Field").setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(IDS.STUDIO_TOGGLE_TS).setLabel("🕒 Timestamp ON/OFF").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IDS.STUDIO_PREVIEW).setLabel("👁️ Preview").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(IDS.STUDIO_PUBLISH).setLabel(publishLabel).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(IDS.STUDIO_CANCEL).setLabel("✖ Annuler").setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2, row3];
}

async function openStudio(interaction, opts = {}) {
  if (!(await isStaff(interaction.member))) {
    return interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
  }

  ensureDraft(interaction.user.id, interaction.channelId);

  // opts: { mode, schedule }
  if (opts?.mode) {
    setDraftMeta(interaction.user.id, {
      mode: opts.mode,
      schedule: opts.schedule || null,
    });
  }

  const draft = getDraft(interaction.user.id);

  const panel = new EmbedBuilder()
    .setTitle("✨ Embed Studio")
    .setDescription(studioPanelText(draft));

  return interaction.reply({
    embeds: [panel],
    components: buildStudioRows(draft),
    flags: EPHEMERAL,
  });
}

async function handleStudioButtons(interaction) {
  if (!interaction.isButton()) return false;
  if (!String(interaction.customId).startsWith("p2:studio:")) return false;

  try {
    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return true;
    }

    const draft = getDraft(interaction.user.id);
    if (!draft || draft.channelId !== interaction.channelId) {
      await interaction.reply({
        content: "❌ Brouillon expiré. Refais `/say embed` ou `/schedule create`.",
        flags: EPHEMERAL,
      });
      return true;
    }

    const id = interaction.customId;

    if (id === IDS.STUDIO_CANCEL) {
      clearDraft(interaction.user.id);
      await interaction.update({ content: "✅ Brouillon annulé.", embeds: [], components: [] });
      return true;
    }

    if (id === IDS.STUDIO_TOGGLE_TS) {
      updateDraft(interaction.user.id, (d) => {
        d.embed.timestamp = !d.embed.timestamp;
      });
      const updated = getDraft(interaction.user.id);
      const panel = new EmbedBuilder().setTitle("✨ Embed Studio").setDescription(studioPanelText(updated));
      await interaction.update({ embeds: [panel], components: buildStudioRows(updated) });
      return true;
    }

    if (id === IDS.STUDIO_PREVIEW) {
      const preview = buildEmbedFromDraft(draft);
      await interaction.reply({ content: "👁️ Preview :", embeds: [preview], flags: EPHEMERAL });
      return true;
    }

    if (id === IDS.STUDIO_PUBLISH) {
      const mode = draft.meta?.mode || "publish";

      // MODE NORMAL: publier maintenant
      if (mode !== "schedule") {
        const toSend = buildEmbedFromDraft(draft);
        await interaction.channel.send({ embeds: [toSend] });
        clearDraft(interaction.user.id);
        await interaction.update({ content: "✅ Embed publié.", embeds: [], components: [] });
        return true;
      }

      // MODE SCHEDULE: créer un scheduler
      const schedCfg = draft.meta?.schedule;
      if (!schedCfg || !schedCfg.guildId || !schedCfg.channelId || !schedCfg.everyMs) {
        await interaction.reply({ content: "❌ Config scheduler manquante. Refais `/schedule create`.", flags: EPHEMERAL });
        return true;
      }

      const sched = addSchedule({
        guildId: schedCfg.guildId,
        channelId: schedCfg.channelId,
        type: "embed",
        everyMs: schedCfg.everyMs,
        payload: draftToPayload(draft),
        createdBy: interaction.user.id,
        startDelayMs: schedCfg.startDelayMs || 0,
        ping: schedCfg.ping || "",
      });

      clearDraft(interaction.user.id);
      await interaction.update({
        content: `✅ Scheduler créé (**#${sched.id}**) — toutes les **${Math.round(sched.everyMs / 60000)} min** dans <#${sched.channelId}>`,
        embeds: [],
        components: [],
      });
      return true;
    }

    // ===== MODALS =====
    if (id === IDS.STUDIO_EDIT_BASIC) {
      const m = new ModalBuilder().setCustomId(IDS.STUDIO_BASIC_MODAL).setTitle("✏️ Titre / Desc / Couleur");

      const title = new TextInputBuilder()
        .setCustomId("title")
        .setLabel("Titre (optionnel)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(256)
        .setValue(draft.embed.title || "");

      const desc = new TextInputBuilder()
        .setCustomId("description")
        .setLabel("Description")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(4000)
        .setValue(draft.embed.description || "");

      const color = new TextInputBuilder()
        .setCustomId("color")
        .setLabel("Couleur HEX (optionnel) ex: #ff8800")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(7)
        .setValue(draft.embed.colorRaw || "");

      m.addComponents(
        new ActionRowBuilder().addComponents(title),
        new ActionRowBuilder().addComponents(desc),
        new ActionRowBuilder().addComponents(color)
      );

      await interaction.showModal(m);
      return true;
    }

    if (id === IDS.STUDIO_EDIT_FOOTER) {
      const m = new ModalBuilder().setCustomId(IDS.STUDIO_FOOTER_MODAL).setTitle("🧾 Footer");

      const ft = new TextInputBuilder()
        .setCustomId("footerText")
        .setLabel("Footer text (optionnel)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(2048)
        .setValue(draft.embed.footerText || "");

      const fi = new TextInputBuilder()
        .setCustomId("footerIcon")
        .setLabel("Footer icon URL (optionnel)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(400)
        .setValue(draft.embed.footerIcon || "");

      m.addComponents(new ActionRowBuilder().addComponents(ft), new ActionRowBuilder().addComponents(fi));
      await interaction.showModal(m);
      return true;
    }

    if (id === IDS.STUDIO_EDIT_AUTHOR) {
      const m = new ModalBuilder().setCustomId(IDS.STUDIO_AUTHOR_MODAL).setTitle("👤 Author");

      const an = new TextInputBuilder()
        .setCustomId("authorName")
        .setLabel("Author name (optionnel)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(256)
        .setValue(draft.embed.authorName || "");

      const ai = new TextInputBuilder()
        .setCustomId("authorIcon")
        .setLabel("Author icon URL (optionnel)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(400)
        .setValue(draft.embed.authorIcon || "");

      m.addComponents(new ActionRowBuilder().addComponents(an), new ActionRowBuilder().addComponents(ai));
      await interaction.showModal(m);
      return true;
    }

    if (id === IDS.STUDIO_EDIT_MEDIA) {
      const m = new ModalBuilder().setCustomId(IDS.STUDIO_MEDIA_MODAL).setTitle("🖼️ Image / Thumbnail");

      const img = new TextInputBuilder()
        .setCustomId("image")
        .setLabel("Image URL (optionnel)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(400)
        .setValue(draft.embed.image || "");

      const th = new TextInputBuilder()
        .setCustomId("thumbnail")
        .setLabel("Thumbnail URL (optionnel)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(400)
        .setValue(draft.embed.thumbnail || "");

      m.addComponents(new ActionRowBuilder().addComponents(img), new ActionRowBuilder().addComponents(th));
      await interaction.showModal(m);
      return true;
    }

    if (id === IDS.STUDIO_ADD_FIELD) {
      const m = new ModalBuilder().setCustomId(IDS.STUDIO_ADD_FIELD_MODAL).setTitle("➕ Ajouter Field");

      const n = new TextInputBuilder()
        .setCustomId("name")
        .setLabel("Nom du field")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(256);

      const v = new TextInputBuilder()
        .setCustomId("value")
        .setLabel("Valeur du field")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1024);

      const inline = new TextInputBuilder()
        .setCustomId("inline")
        .setLabel("Inline ? true/false (optionnel)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(10);

      m.addComponents(
        new ActionRowBuilder().addComponents(n),
        new ActionRowBuilder().addComponents(v),
        new ActionRowBuilder().addComponents(inline)
      );

      await interaction.showModal(m);
      return true;
    }

    if (id === IDS.STUDIO_REMOVE_FIELD) {
      const m = new ModalBuilder().setCustomId(IDS.STUDIO_REMOVE_FIELD_MODAL).setTitle("➖ Supprimer Field");

      const idx = new TextInputBuilder()
        .setCustomId("index")
        .setLabel("Index à supprimer (1 = premier)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(4);

      m.addComponents(new ActionRowBuilder().addComponents(idx));
      await interaction.showModal(m);
      return true;
    }

    return false;
  } catch (e) {
    console.error("[part2] studio button error:", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Erreur Embed Studio.", flags: EPHEMERAL });
    }
    return true;
  }
}

async function handleStudioModals(interaction) {
  if (!interaction.isModalSubmit()) return false;
  if (!String(interaction.customId).startsWith("p2:studio:")) return false;

  try {
    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return true;
    }

    const draft = getDraft(interaction.user.id);
    if (!draft || draft.channelId !== interaction.channelId) {
      await interaction.reply({
        content: "❌ Brouillon expiré. Refais `/say embed` ou `/schedule create`.",
        flags: EPHEMERAL,
      });
      return true;
    }

    const id = interaction.customId;

    if (id === IDS.STUDIO_BASIC_MODAL) {
      const title = interaction.fields.getTextInputValue("title") || "";
      const description = interaction.fields.getTextInputValue("description") || "";
      const colorRaw = interaction.fields.getTextInputValue("color") || "";

      if (colorRaw && parseHexColor(colorRaw) === null) {
        await interaction.reply({ content: "❌ Couleur invalide. Exemple: #ff8800", flags: EPHEMERAL });
        return true;
      }

      updateDraft(interaction.user.id, (d) => {
        d.embed.title = title;
        d.embed.description = description;
        d.embed.colorRaw = colorRaw;
      });
    }

    if (id === IDS.STUDIO_FOOTER_MODAL) {
      const footerText = interaction.fields.getTextInputValue("footerText") || "";
      const footerIcon = interaction.fields.getTextInputValue("footerIcon") || "";

      updateDraft(interaction.user.id, (d) => {
        d.embed.footerText = footerText;
        d.embed.footerIcon = footerIcon;
      });
    }

    if (id === IDS.STUDIO_AUTHOR_MODAL) {
      const authorName = interaction.fields.getTextInputValue("authorName") || "";
      const authorIcon = interaction.fields.getTextInputValue("authorIcon") || "";

      updateDraft(interaction.user.id, (d) => {
        d.embed.authorName = authorName;
        d.embed.authorIcon = authorIcon;
      });
    }

    if (id === IDS.STUDIO_MEDIA_MODAL) {
      const image = interaction.fields.getTextInputValue("image") || "";
      const thumbnail = interaction.fields.getTextInputValue("thumbnail") || "";

      updateDraft(interaction.user.id, (d) => {
        d.embed.image = image;
        d.embed.thumbnail = thumbnail;
      });
    }

    if (id === IDS.STUDIO_ADD_FIELD_MODAL) {
      const name = interaction.fields.getTextInputValue("name") || "";
      const value = interaction.fields.getTextInputValue("value") || "";
      const inlineRaw = (interaction.fields.getTextInputValue("inline") || "").trim().toLowerCase();
      const inline = inlineRaw === "true" || inlineRaw === "1" || inlineRaw === "yes" || inlineRaw === "on";

      updateDraft(interaction.user.id, (d) => {
        d.embed.fields = d.embed.fields || [];
        if (d.embed.fields.length < 25) d.embed.fields.push({ name, value, inline });
      });
    }

    if (id === IDS.STUDIO_REMOVE_FIELD_MODAL) {
      const indexRaw = interaction.fields.getTextInputValue("index");
      const i = Number(indexRaw) - 1;

      updateDraft(interaction.user.id, (d) => {
        d.embed.fields = d.embed.fields || [];
        if (Number.isInteger(i) && i >= 0 && i < d.embed.fields.length) {
          d.embed.fields.splice(i, 1);
        }
      });
    }

    const updated = getDraft(interaction.user.id);
    const panel = new EmbedBuilder().setTitle("✨ Embed Studio").setDescription(studioPanelText(updated));

    await interaction.reply({
      content: "✅ Modifié.",
      embeds: [panel],
      components: buildStudioRows(updated),
      flags: EPHEMERAL,
    });
    return true;
  } catch (e) {
    console.error("[part2] studio modal error:", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Erreur Embed Studio.", flags: EPHEMERAL });
    }
    return true;
  }
}

async function handleEmbedStudioInteraction(interaction) {
  if (await handleStudioButtons(interaction)) return true;
  if (await handleStudioModals(interaction)) return true;
  return false;
}

module.exports = { openStudio, handleEmbedStudioInteraction };
