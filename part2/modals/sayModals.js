// part2/modals/sayModals.js
const {
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlagsBitField,
} = require("discord.js");

const { SAY_IDS } = require("../say/ids");
const { isStaff } = require("../permissions");
const { setSayDraft, getSayDraft } = require("../say/sayState");
const { buildStudioPreviewPayload, isTruthyOuiNon, isValidHttpUrl } = require("../say/sayPreview");

// Tu as déjà ce util chez toi : parseHexColor
const { parseHexColor } = require("../util");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

function buildMediaModal(prefill = {}) {
  const modal = new ModalBuilder()
    .setCustomId(SAY_IDS.MODAL_EMBED_MEDIA)
    .setTitle("Studio /say — Embed (Media)");

  const authorName = new TextInputBuilder()
    .setCustomId("authorName")
    .setLabel("Auteur (optionnel)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(256)
    .setValue(prefill.authorName || "");

  const authorIconUrl = new TextInputBuilder()
    .setCustomId("authorIconUrl")
    .setLabel("Icon auteur (URL optionnelle)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500)
    .setValue(prefill.authorIconUrl || "");

  const thumbnailUrl = new TextInputBuilder()
    .setCustomId("thumbnailUrl")
    .setLabel("Thumbnail (URL optionnelle)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500)
    .setValue(prefill.thumbnailUrl || "");

  const imageUrl = new TextInputBuilder()
    .setCustomId("imageUrl")
    .setLabel("Image (URL optionnelle)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500)
    .setValue(prefill.imageUrl || "");

  const timestamp = new TextInputBuilder()
    .setCustomId("timestamp")
    .setLabel("Timestamp ? (oui/non) — optionnel")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(8)
    .setValue(prefill.timestamp || "");

  modal.addComponents(
    new ActionRowBuilder().addComponents(authorName),
    new ActionRowBuilder().addComponents(authorIconUrl),
    new ActionRowBuilder().addComponents(thumbnailUrl),
    new ActionRowBuilder().addComponents(imageUrl),
    new ActionRowBuilder().addComponents(timestamp)
  );

  return modal;
}

function buildActionsModal(prefill = {}) {
  const modal = new ModalBuilder()
    .setCustomId(SAY_IDS.MODAL_ACTIONS)
    .setTitle("Studio /say — Boutons lien");

  const b1l = new TextInputBuilder()
    .setCustomId("b1label")
    .setLabel("Bouton 1 — Label (optionnel)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(80)
    .setValue(prefill.b1label || "");

  const b1u = new TextInputBuilder()
    .setCustomId("b1url")
    .setLabel("Bouton 1 — URL (optionnel)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500)
    .setValue(prefill.b1url || "");

  const b2l = new TextInputBuilder()
    .setCustomId("b2label")
    .setLabel("Bouton 2 — Label (optionnel)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(80)
    .setValue(prefill.b2label || "");

  const b2u = new TextInputBuilder()
    .setCustomId("b2url")
    .setLabel("Bouton 2 — URL (optionnel)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500)
    .setValue(prefill.b2url || "");

  modal.addComponents(
    new ActionRowBuilder().addComponents(b1l),
    new ActionRowBuilder().addComponents(b1u),
    new ActionRowBuilder().addComponents(b2l),
    new ActionRowBuilder().addComponents(b2u)
  );

  return modal;
}

function makePremiumEmbedFromFields(fields) {
  const e = new EmbedBuilder();

  const title = fields.title?.trim() || null;
  const description = fields.description?.trim() || null;
  const footerText = fields.footerText?.trim() || null;
  const url = fields.url?.trim() || null;

  if (title) e.setTitle(title);
  if (description) e.setDescription(description);

  const colorRaw = fields.color?.trim();
  if (colorRaw) {
    const parsed = parseHexColor(colorRaw); // doit renvoyer un int ou null
    if (parsed != null) e.setColor(parsed);
  }

  if (footerText) e.setFooter({ text: footerText });

  if (url && isValidHttpUrl(url)) e.setURL(url);

  // Petite signature premium (tu peux changer si tu veux)
  e.setTimestamp(new Date());

  return e;
}

async function handleSayModals(interaction) {
  if (!interaction.isModalSubmit()) return false;

  const cid = interaction.customId;
  const isText = cid === SAY_IDS.MODAL_TEXT;
  const isBasic = cid === SAY_IDS.MODAL_EMBED_BASIC;
  const isMedia = cid === SAY_IDS.MODAL_EMBED_MEDIA;
  const isActions = cid === SAY_IDS.MODAL_ACTIONS;

  if (!isText && !isBasic && !isMedia && !isActions) return false;

  try {
    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return true;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    // TEXT — création / maj
    if (isText) {
      const content = interaction.fields.getTextInputValue("content") || "";
      const draft = {
        type: "text",
        ownerId: userId,
        guildId,
        channelId: interaction.channelId,
        allowMentions: false,
        text: { content },
        buttons: [],
        meta: { createdAt: Date.now(), updatedAt: Date.now() },
      };

      setSayDraft(guildId, userId, draft);

      const payload = buildStudioPreviewPayload(draft, "Brouillon texte prêt.");
      await interaction.reply({ ...payload, flags: EPHEMERAL });
      return true;
    }

    // EMBED BASIC — création / maj
    if (isBasic) {
      const title = interaction.fields.getTextInputValue("title") || "";
      const description = interaction.fields.getTextInputValue("description") || "";
      const color = interaction.fields.getTextInputValue("color") || "";
      const footerText = interaction.fields.getTextInputValue("footerText") || "";
      const url = interaction.fields.getTextInputValue("url") || "";

      const embed = makePremiumEmbedFromFields({ title, description, color, footerText, url });

      const existing = getSayDraft(guildId, userId);
      const draft = {
        type: "embed",
        ownerId: userId,
        guildId,
        channelId: existing?.channelId || interaction.channelId,
        allowMentions: existing?.allowMentions === true,
        buttons: Array.isArray(existing?.buttons) ? existing.buttons : [],
        embed,
        // on garde les prefs media dans meta pour préfill
        meta: {
          createdAt: existing?.meta?.createdAt || Date.now(),
          updatedAt: Date.now(),
          media: existing?.meta?.media || {},
          basic: { title, description, color, footerText, url },
        },
      };

      setSayDraft(guildId, userId, draft);

      const payload = buildStudioPreviewPayload(draft, "Brouillon embed mis à jour (Base).");
      await interaction.reply({ ...payload, flags: EPHEMERAL });
      return true;
    }

    // Les modals MEDIA/ACTIONS nécessitent un draft existant
    const existing = getSayDraft(guildId, userId);
    if (!existing) {
      await interaction.reply({
        content: "❌ Brouillon expiré. Relance `/say text` ou `/say embed`.",
        flags: EPHEMERAL,
      });
      return true;
    }

    if (existing.ownerId !== userId) {
      await interaction.reply({ content: "❌ Ce brouillon ne t’appartient pas.", flags: EPHEMERAL });
      return true;
    }

    // EMBED MEDIA — patch embed existant
    if (isMedia) {
      if (existing.type !== "embed" || !existing.embed) {
        await interaction.reply({ content: "❌ Media disponible uniquement pour un embed.", flags: EPHEMERAL });
        return true;
      }

      const authorName = interaction.fields.getTextInputValue("authorName") || "";
      const authorIconUrl = interaction.fields.getTextInputValue("authorIconUrl") || "";
      const thumbnailUrl = interaction.fields.getTextInputValue("thumbnailUrl") || "";
      const imageUrl = interaction.fields.getTextInputValue("imageUrl") || "";
      const timestampRaw = interaction.fields.getTextInputValue("timestamp") || "";

      // Author
      if (authorName.trim()) {
        existing.embed.setAuthor({
          name: authorName.trim(),
          iconURL: isValidHttpUrl(authorIconUrl.trim()) ? authorIconUrl.trim() : undefined,
        });
      } else {
        // Si pas de nom, on retire l'author
        existing.embed.setAuthor(null);
      }

      // Thumbnail / Image
      if (isValidHttpUrl(thumbnailUrl.trim())) existing.embed.setThumbnail(thumbnailUrl.trim());
      else existing.embed.setThumbnail(null);

      if (isValidHttpUrl(imageUrl.trim())) existing.embed.setImage(imageUrl.trim());
      else existing.embed.setImage(null);

      // Timestamp toggle
      const shouldTimestamp = isTruthyOuiNon(timestampRaw, true);
      if (shouldTimestamp) existing.embed.setTimestamp(new Date());
      else existing.embed.setTimestamp(null);

      existing.meta = existing.meta || {};
      existing.meta.updatedAt = Date.now();
      existing.meta.media = {
        authorName,
        authorIconUrl,
        thumbnailUrl,
        imageUrl,
        timestamp: timestampRaw,
      };

      setSayDraft(guildId, userId, existing);

      const payload = buildStudioPreviewPayload(existing, "Brouillon embed mis à jour (Media).");
      await interaction.reply({ ...payload, flags: EPHEMERAL });
      return true;
    }

    // ACTIONS — boutons lien (valable texte + embed)
    if (isActions) {
      const b1label = (interaction.fields.getTextInputValue("b1label") || "").trim();
      const b1url = (interaction.fields.getTextInputValue("b1url") || "").trim();
      const b2label = (interaction.fields.getTextInputValue("b2label") || "").trim();
      const b2url = (interaction.fields.getTextInputValue("b2url") || "").trim();

      const nextButtons = [];

      if (b1label && b1url) {
        if (!isValidHttpUrl(b1url)) {
          await interaction.reply({ content: "❌ Bouton 1 : URL invalide (http/https).", flags: EPHEMERAL });
          return true;
        }
        nextButtons.push({ label: b1label, url: b1url });
      }

      if (b2label && b2url) {
        if (!isValidHttpUrl(b2url)) {
          await interaction.reply({ content: "❌ Bouton 2 : URL invalide (http/https).", flags: EPHEMERAL });
          return true;
        }
        nextButtons.push({ label: b2label, url: b2url });
      }

      existing.buttons = nextButtons;
      existing.meta = existing.meta || {};
      existing.meta.updatedAt = Date.now();
      existing.meta.actions = { b1label, b1url, b2label, b2url };

      setSayDraft(guildId, userId, existing);

      const payload = buildStudioPreviewPayload(existing, "Boutons lien mis à jour.");
      await interaction.reply({ ...payload, flags: EPHEMERAL });
      return true;
    }

    return false;
  } catch (e) {
    console.error("handleSayModals error:", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Erreur interne (Say Modals).", flags: EPHEMERAL }).catch(() => {});
    }
    return true;
  }
}

module.exports = { handleSayModals, buildMediaModal, buildActionsModal };