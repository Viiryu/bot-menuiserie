// part2/say/sayPreview.js
// Génère un preview "ultra premium" + composants (boutons + select channel).

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
} = require("discord.js");

const { SAY_IDS } = require("./ids");

function safeTrim(str, max) {
  if (!str) return "";
  const s = String(str);
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function formatChannelMention(channelId) {
  return channelId ? `<#${channelId}>` : "—";
}

function isTruthyOuiNon(v, defaultValue = false) {
  if (v == null || v === "") return defaultValue;
  const s = String(v).trim().toLowerCase();
  if (["oui", "o", "yes", "y", "true", "1"].includes(s)) return true;
  if (["non", "n", "no", "false", "0"].includes(s)) return false;
  return defaultValue;
}

function isValidHttpUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function buildOutboundPayloadFromDraft(draft) {
  const allowMentions = draft.allowMentions === true;
  const allowedMentions = allowMentions
    ? { parse: ["users", "roles", "everyone"] }
    : { parse: [] };

  const components = [];
  if (Array.isArray(draft.buttons) && draft.buttons.length > 0) {
    const row = new ActionRowBuilder();
    for (const b of draft.buttons.slice(0, 5)) {
      if (!b?.label || !b?.url) continue;
      if (!isValidHttpUrl(b.url)) continue;
      row.addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(safeTrim(b.label, 80))
          .setURL(b.url)
      );
    }
    if (row.components.length > 0) components.push(row);
  }

  if (draft.type === "text") {
    return {
      content: draft.text?.content || "",
      allowedMentions,
      components,
    };
  }

  // embed
  return {
    embeds: draft.embed ? [draft.embed] : [],
    allowedMentions,
    components,
  };
}

function buildControlEmbed(draft, statusText = null) {
  const createdAt = draft.meta?.createdAt ? new Date(draft.meta.createdAt) : null;
  const updatedAt = draft.meta?.updatedAt ? new Date(draft.meta.updatedAt) : null;

  const e = new EmbedBuilder()
    .setTitle("🧪 Studio /say — Aperçu premium")
    .setDescription(
      [
        "Tu peux **prévisualiser**, **modifier**, **tester** et **publier** — sans spam ni commandes inutiles.",
        "",
        statusText ? `**Statut :** ${statusText}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .addFields(
      {
        name: "🎯 Salon cible",
        value: formatChannelMention(draft.channelId),
        inline: true,
      },
      {
        name: "🔔 Mentions",
        value: draft.allowMentions ? "✅ Autorisées" : "❌ Bloquées",
        inline: true,
      },
      {
        name: "🧩 Type",
        value: draft.type === "embed" ? "Embed" : "Texte",
        inline: true,
      }
    );

  const btnCount = Array.isArray(draft.buttons) ? draft.buttons.filter(b => b?.label && b?.url).length : 0;
  e.addFields({
    name: "🔗 Boutons lien",
    value: btnCount > 0 ? `✅ ${btnCount} bouton(s)` : "—",
    inline: true,
  });

  if (createdAt || updatedAt) {
    e.setFooter({
      text: [
        createdAt ? `Créé: ${createdAt.toLocaleString("fr-FR")}` : null,
        updatedAt ? `Maj: ${updatedAt.toLocaleString("fr-FR")}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
    });
  }

  return e;
}

function buildContentPreviewEmbed(draft) {
  if (draft.type === "embed") {
    // L'embed "final" est déjà prêt dans draft.embed
    return draft.embed;
  }

  const content = draft.text?.content || "";
  const preview = safeTrim(content, 3500);

  return new EmbedBuilder()
    .setTitle("📝 Aperçu du message texte")
    .setDescription(preview ? preview : "—")
    .addFields({
      name: "📏 Longueur",
      value: `${content.length} caractères`,
      inline: true,
    });
}

function buildStudioComponents(draft) {
  // Row 1
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(SAY_IDS.BTN_PUBLISH)
      .setLabel("Publier")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(SAY_IDS.BTN_TEST)
      .setLabel("Test")
      .setEmoji("🧪")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(SAY_IDS.BTN_TOGGLE_MENTIONS)
      .setLabel(draft.allowMentions ? "Mentions: ON" : "Mentions: OFF")
      .setEmoji("🔔")
      .setStyle(draft.allowMentions ? ButtonStyle.Secondary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(SAY_IDS.BTN_CANCEL)
      .setLabel("Annuler")
      .setEmoji("🗑️")
      .setStyle(ButtonStyle.Danger)
  );

  // Row 2 (edit)
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(SAY_IDS.BTN_EDIT_BASIC)
      .setLabel("Modifier")
      .setEmoji("✏️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(SAY_IDS.BTN_EDIT_MEDIA)
      .setLabel("Media")
      .setEmoji("🖼️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(SAY_IDS.BTN_EDIT_ACTIONS)
      .setLabel("Boutons")
      .setEmoji("🔗")
      .setStyle(ButtonStyle.Secondary)
  );

  // Row 3 (channel select)
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(SAY_IDS.SELECT_CHANNEL)
    .setPlaceholder("📌 Choisir le salon cible…")
    .setMinValues(1)
    .setMaxValues(1)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

  const row3 = new ActionRowBuilder().addComponents(channelSelect);

  return [row1, row2, row3];
}

function buildStudioPreviewPayload(draft, statusText = null) {
  const control = buildControlEmbed(draft, statusText);
  const contentPreview = buildContentPreviewEmbed(draft);

  const embeds = [control].filter(Boolean);
  if (contentPreview) embeds.push(contentPreview);

  return {
    embeds,
    components: buildStudioComponents(draft),
  };
}

module.exports = {
  isTruthyOuiNon,
  isValidHttpUrl,
  buildOutboundPayloadFromDraft,
  buildStudioPreviewPayload,
};