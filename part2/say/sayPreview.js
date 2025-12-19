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

  // SAFE par défaut : users/roles uniquement (pas everyone).
  // (Le “everyone” peut être autorisé côté sayComponents.js si permission OK.)
  const allowedMentions = allowMentions
    ? { parse: ["users", "roles"] }
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

  const typeLabel = draft.type === "embed" ? "🧩 Embed" : "📝 Texte";
  const mentionLabel = draft.allowMentions ? "✅ Autorisées" : "❌ Bloquées";
  const channelLabel = formatChannelMention(draft.channelId);

  const btnCount = Array.isArray(draft.buttons)
    ? draft.buttons.filter((b) => b?.label && b?.url && isValidHttpUrl(b.url)).length
    : 0;

  const e = new EmbedBuilder()
    .setTitle("🧪 Studio /say — Aperçu premium")
    .setDescription(
      [
        "Prévisualise, modifie, teste et publie **sans spam**.",
        statusText ? `\n**Statut :** ${statusText}` : "",
      ].join("\n")
    )
    .addFields(
      { name: "🎯 Salon cible", value: channelLabel, inline: true },
      { name: "🔔 Mentions", value: mentionLabel, inline: true },
      { name: "🧩 Type", value: typeLabel, inline: true },
      {
        name: "🔗 Boutons lien",
        value: btnCount > 0 ? `✅ ${btnCount} bouton(s)` : "—",
        inline: true,
      },
      {
        name: "🚀 Modes de publication",
        value:
          "✅ **Publier** (standard)\n🔕 **Silent** (zéro ping)\n🔔 **Mention** (si Mentions ON)",
        inline: true,
      }
    );

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
  // Row 1 (publish/test)
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(SAY_IDS.BTN_PUBLISH)
      .setLabel("Publier")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(SAY_IDS.BTN_PUBLISH_SILENT)
      .setLabel("Silent")
      .setEmoji("🔕")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(SAY_IDS.BTN_PUBLISH_MENTION)
      .setLabel("Mention")
      .setEmoji("🔔")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(SAY_IDS.BTN_TEST)
      .setLabel("Test")
      .setEmoji("🧪")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(SAY_IDS.BTN_CANCEL)
      .setLabel("Annuler")
      .setEmoji("🗑️")
      .setStyle(ButtonStyle.Danger)
  );

  // Row 2 (edit + toggles)
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(SAY_IDS.BTN_TOGGLE_MENTIONS)
      .setLabel(draft.allowMentions ? "Mentions: ON" : "Mentions: OFF")
      .setEmoji("🔔")
      .setStyle(ButtonStyle.Secondary),
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
