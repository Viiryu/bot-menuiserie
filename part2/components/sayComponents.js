// part2/components/sayComponents.js
const {
  MessageFlagsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");

const { SAY_IDS } = require("../say/ids");
const { isStaff } = require("../permissions");
const { getSayDraft, patchSayDraft, clearSayDraft } = require("../say/sayState");
const { buildStudioPreviewPayload, buildOutboundPayloadFromDraft } = require("../say/sayPreview");
const { buildMediaModal, buildActionsModal } = require("../modals/sayModals");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

function isSayButtonId(id) {
  return [
    SAY_IDS.BTN_PUBLISH,
    SAY_IDS.BTN_TEST,
    SAY_IDS.BTN_EDIT_BASIC,
    SAY_IDS.BTN_EDIT_MEDIA,
    SAY_IDS.BTN_EDIT_ACTIONS,
    SAY_IDS.BTN_TOGGLE_MENTIONS,
    SAY_IDS.BTN_CANCEL,
  ].includes(id);
}

function buildTextEditModal(prefill = {}) {
  const modal = new ModalBuilder()
    .setCustomId(SAY_IDS.MODAL_TEXT)
    .setTitle("Studio /say — Modifier texte");

  const content = new TextInputBuilder()
    .setCustomId("content")
    .setLabel("Message")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000)
    .setValue(prefill.content || "");

  modal.addComponents(new ActionRowBuilder().addComponents(content));
  return modal;
}

function buildEmbedBasicEditModal(prefill = {}) {
  const modal = new ModalBuilder()
    .setCustomId(SAY_IDS.MODAL_EMBED_BASIC)
    .setTitle("Studio /say — Modifier embed (Base)");

  const title = new TextInputBuilder()
    .setCustomId("title")
    .setLabel("Titre (optionnel)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(256)
    .setValue(prefill.title || "");

  const description = new TextInputBuilder()
    .setCustomId("description")
    .setLabel("Description")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(4000)
    .setValue(prefill.description || "");

  const color = new TextInputBuilder()
    .setCustomId("color")
    .setLabel("Couleur hex (optionnel) ex: #CBA135")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(16)
    .setValue(prefill.color || "");

  const footerText = new TextInputBuilder()
    .setCustomId("footerText")
    .setLabel("Footer (optionnel)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(2048)
    .setValue(prefill.footerText || "");

  const url = new TextInputBuilder()
    .setCustomId("url")
    .setLabel("URL (optionnel)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500)
    .setValue(prefill.url || "");

  modal.addComponents(
    new ActionRowBuilder().addComponents(title),
    new ActionRowBuilder().addComponents(description),
    new ActionRowBuilder().addComponents(color),
    new ActionRowBuilder().addComponents(footerText),
    new ActionRowBuilder().addComponents(url)
  );

  return modal;
}

async function handleSayComponents(interaction) {
  // Channel select
  if (interaction.isChannelSelectMenu() && interaction.customId === SAY_IDS.SELECT_CHANNEL) {
    try {
      if (!(await isStaff(interaction.member))) {
        await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
        return true;
      }

      const draft = getSayDraft(interaction.guildId, interaction.user.id);
      if (!draft) {
        await interaction.reply({
          content: "❌ Brouillon expiré. Relance `/say text` ou `/say embed`.",
          flags: EPHEMERAL,
        });
        return true;
      }
      if (draft.ownerId !== interaction.user.id) {
        await interaction.reply({ content: "❌ Ce brouillon ne t’appartient pas.", flags: EPHEMERAL });
        return true;
      }

      const channelId = interaction.values?.[0];
      patchSayDraft(interaction.guildId, interaction.user.id, { channelId });

      const next = getSayDraft(interaction.guildId, interaction.user.id);
      const payload = buildStudioPreviewPayload(next, `Salon cible défini sur ${channelId ? `<#${channelId}>` : "—"}.`);

      // IMPORTANT: pas de flags dans update()
      await interaction.update(payload);
      return true;
    } catch (e) {
      console.error("handleSayComponents channelSelect error:", e);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "❌ Erreur interne (Select).", flags: EPHEMERAL }).catch(() => {});
      }
      return true;
    }
  }

  // Buttons
  if (!interaction.isButton()) return false;
  if (!isSayButtonId(interaction.customId)) return false;

  try {
    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return true;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    const draft = getSayDraft(guildId, userId);
    if (!draft) {
      await interaction.reply({
        content: "❌ Brouillon expiré. Relance `/say text` ou `/say embed`.",
        flags: EPHEMERAL,
      });
      return true;
    }
    if (draft.ownerId !== userId) {
      await interaction.reply({ content: "❌ Ce brouillon ne t’appartient pas.", flags: EPHEMERAL });
      return true;
    }

    // Toggle mentions
    if (interaction.customId === SAY_IDS.BTN_TOGGLE_MENTIONS) {
      const next = patchSayDraft(guildId, userId, { allowMentions: !draft.allowMentions });
      const payload = buildStudioPreviewPayload(next, next.allowMentions ? "Mentions activées." : "Mentions bloquées.");
      await interaction.update(payload);
      return true;
    }

    // Cancel
    if (interaction.customId === SAY_IDS.BTN_CANCEL) {
      clearSayDraft(guildId, userId);
      await interaction.update({
        embeds: [
          {
            title: "🗑️ Brouillon annulé",
            description: "Relance `/say text` ou `/say embed` pour recommencer.",
          },
        ],
        components: [],
      });
      return true;
    }

    // Edit basic
    if (interaction.customId === SAY_IDS.BTN_EDIT_BASIC) {
      if (draft.type === "text") {
        await interaction.showModal(buildTextEditModal({ content: draft.text?.content || "" }));
        return true;
      }

      const pre = draft.meta?.basic || {};
      await interaction.showModal(buildEmbedBasicEditModal(pre));
      return true;
    }

    // Edit media
    if (interaction.customId === SAY_IDS.BTN_EDIT_MEDIA) {
      if (draft.type !== "embed") {
        await interaction.reply({ content: "❌ Media est dispo uniquement pour un embed.", flags: EPHEMERAL });
        return true;
      }
      const pre = draft.meta?.media || {};
      await interaction.showModal(buildMediaModal(pre));
      return true;
    }

    // Edit actions (buttons)
    if (interaction.customId === SAY_IDS.BTN_EDIT_ACTIONS) {
      const pre = draft.meta?.actions || {};
      await interaction.showModal(buildActionsModal(pre));
      return true;
    }

    // Test / Publish
    if (interaction.customId === SAY_IDS.BTN_TEST || interaction.customId === SAY_IDS.BTN_PUBLISH) {
      const targetId = draft.channelId || interaction.channelId;
      const channel = await interaction.guild.channels.fetch(targetId).catch(() => null);

      if (!channel || !channel.isTextBased()) {
        await interaction.reply({
          content: "❌ Salon invalide ou inaccessible. Choisis un salon texte valide.",
          flags: EPHEMERAL,
        });
        return true;
      }

      const outbound = buildOutboundPayloadFromDraft(draft);

      // Envoyer
      const sent = await channel.send(outbound);

      if (interaction.customId === SAY_IDS.BTN_PUBLISH) {
        clearSayDraft(guildId, userId);

        // update preview sans flags
        await interaction.update({
          embeds: [
            {
              title: "✅ Publié",
              description: `Message publié dans <#${channel.id}>.\nID: \`${sent.id}\``,
            },
          ],
          components: [],
        });

        return true;
      }

      // TEST: on garde le draft
      const payload = buildStudioPreviewPayload(draft, `Test envoyé dans <#${channel.id}> (ID: \`${sent.id}\`).`);
      await interaction.update(payload);
      return true;
    }

    return false;
  } catch (e) {
    console.error("handleSayComponents button error:", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Erreur interne (Say Buttons).", flags: EPHEMERAL }).catch(() => {});
    }
    return true;
  }
}

module.exports = { handleSayComponents };