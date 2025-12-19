// part2/autorole/autoroleUI.js
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
  ChannelType,
  MessageFlagsBitField,
} = require("discord.js");

const { AUTOROLE_IDS } = require("./ids");
const { isStaff } = require("../permissions");
const { setPending, getPending, clearPending, patchPending, upsertAutoroleMessage } = require("./autoroleState");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

function parseHexColorSafe(hex, fallback = 0xCBA135) {
  const s = String(hex || "").trim().replace(/^0x/i, "#");
  const m = s.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return fallback;
  return parseInt(m[1], 16);
}

function clamp(s, n) {
  const str = String(s ?? "");
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function msToHuman(ms) {
  const m = Math.max(1, Math.round((Number(ms) || 0) / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return `${h} h`;
}

function buildWizardEmbed(draft, statusText = null) {
  const rolesCount = Array.isArray(draft.roleIds) ? draft.roleIds.length : 0;
  const modeLabel = draft.mode === "add" ? "➕ Add-only" : "🔁 Toggle (add/remove)";
  const multiLabel = draft.multi ? "✅ Multi" : "☑️ Mono";
  const replLabel = draft.remplacement ? "✅ Remplacement" : "❌ Remplacement";
  const tmpLabel = draft.temporary ? `⏳ Temporaire (${msToHuman(draft.durationMs)})` : "♾️ Définitif";

  const e = new EmbedBuilder()
    .setColor(parseHexColorSafe(draft.color))
    .setTitle("🎛️ Autorole — Wizard premium")
    .setDescription(
      [
        "Configure ton menu d’auto-rôles **sans texte** : sélecteurs + boutons + modals.",
        "",
        statusText ? `**Statut :** ${statusText}` : null,
      ].filter(Boolean).join("\n")
    )
    .addFields(
      { name: "📌 Salon cible", value: draft.channelId ? `<#${draft.channelId}>` : "—", inline: true },
      { name: "🧩 Rôles", value: rolesCount ? `✅ ${rolesCount} rôle(s)` : "—", inline: true },
      { name: "⚙️ Mode", value: modeLabel, inline: true },

      { name: "👥 Sélection", value: multiLabel, inline: true },
      { name: "🔁 Remplacement", value: replLabel, inline: true },
      { name: "⏳ Durée", value: tmpLabel, inline: true },

      {
        name: "🎨 Style (embed)",
        value: [
          `**Titre :** ${clamp(draft.title || "—", 80)}`,
          `**Placeholder :** ${clamp(draft.placeholder || "—", 80)}`,
          `**Couleur :** \`${draft.color || "—"}\``,
        ].join("\n"),
        inline: false,
      }
    )
    .setFooter({ text: "Astuce: le bot doit avoir Manage Roles + être au-dessus des rôles." })
    .setTimestamp(new Date());

  return e;
}

function buildPublicEmbed(config) {
  const color = parseHexColorSafe(config.color);
  const modeLabel = config.mode === "add" ? "➕ Add-only" : "🔁 Toggle (add/remove)";
  const multiLabel = config.multi ? "Multi" : "Mono";
  const replLabel = config.remplacement ? "Remplacement" : "Sans remplacement";
  const tmpLabel = config.temporary ? `⏳ Temporaire (${msToHuman(config.durationMs)})` : "♾️ Définitif";

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(config.title || "🎭 Autoroles")
    .setDescription(
      [
        config.description || "",
        "",
        `**Mode :** ${modeLabel}`,
        `**Sélection :** ${multiLabel}`,
        `**Comportement :** ${replLabel}`,
        `**Durée :** ${tmpLabel}`,
      ].filter(Boolean).join("\n")
    )
    .setFooter({ text: config.footer || "Auto-rôles" })
    .setTimestamp(new Date());
}

function buildWizardComponents(draft) {
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(AUTOROLE_IDS.WIZ_ROLE_SELECT)
    .setPlaceholder("🎭 Choisir les rôles autorisés…")
    .setMinValues(0)
    .setMaxValues(25);

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(AUTOROLE_IDS.WIZ_CHANNEL_SELECT)
    .setPlaceholder("📌 Choisir le salon cible…")
    .setMinValues(1)
    .setMaxValues(1)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

  const row1 = new ActionRowBuilder().addComponents(roleSelect);
  const row2 = new ActionRowBuilder().addComponents(channelSelect);

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(AUTOROLE_IDS.WIZ_TOGGLE_MODE)
      .setLabel(draft.mode === "add" ? "Mode: Add-only" : "Mode: Toggle")
      .setEmoji("⚙️")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(AUTOROLE_IDS.WIZ_TOGGLE_MULTI)
      .setLabel(draft.multi ? "Multi: ON" : "Multi: OFF")
      .setEmoji("👥")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(AUTOROLE_IDS.WIZ_TOGGLE_REPLACEMENT)
      .setLabel(draft.remplacement ? "Remplacement: ON" : "Remplacement: OFF")
      .setEmoji("🔁")
      .setStyle(ButtonStyle.Secondary)
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(AUTOROLE_IDS.WIZ_TOGGLE_TEMP)
      .setLabel(draft.temporary ? "Temporaire: ON" : "Temporaire: OFF")
      .setEmoji("⏳")
      .setStyle(draft.temporary ? ButtonStyle.Primary : ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(AUTOROLE_IDS.WIZ_EDIT_DURATION)
      .setLabel("Durée…")
      .setEmoji("🕒")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!draft.temporary),

    new ButtonBuilder()
      .setCustomId(AUTOROLE_IDS.WIZ_EDIT_STYLE)
      .setLabel("Style (embed)…")
      .setEmoji("🎨")
      .setStyle(ButtonStyle.Secondary)
  );

  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(AUTOROLE_IDS.WIZ_PUBLISH)
      .setLabel("Publier")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(AUTOROLE_IDS.WIZ_CANCEL)
      .setLabel("Annuler")
      .setEmoji("🗑️")
      .setStyle(ButtonStyle.Danger)
  );

  return [row1, row2, row3, row4, row5];
}

function buildPublicComponents(config) {
  const max = config.multi ? Math.max(1, Math.min(25, (config.roleIds || []).length)) : 1;

  const menu = new RoleSelectMenuBuilder()
    .setCustomId(AUTOROLE_IDS.PUBLIC_MENU)
    .setPlaceholder(clamp(config.placeholder || "Choisir un rôle…", 100))
    .setMinValues(1)
    .setMaxValues(max);

  return [new ActionRowBuilder().addComponents(menu)];
}

function buildWizardPayload(draft, statusText) {
  return {
    embeds: [buildWizardEmbed(draft, statusText)],
    components: buildWizardComponents(draft),
  };
}

// ========================= WIZARD HANDLER =========================
async function handleAutoroleInteraction(interaction) {
  // ====== MODALS ======
  if (interaction.isModalSubmit?.()) {
    if (interaction.customId !== AUTOROLE_IDS.MODAL_STYLE && interaction.customId !== AUTOROLE_IDS.MODAL_DURATION) {
      return false;
    }

    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return true;
    }

    const draft = getPending(interaction.guildId, interaction.user.id);
    if (!draft) {
      await interaction.reply({ content: "❌ Wizard expiré. Relance `/autorole create`.", flags: EPHEMERAL });
      return true;
    }

    if (interaction.customId === AUTOROLE_IDS.MODAL_STYLE) {
      const title = interaction.fields.getTextInputValue("title") || draft.title;
      const description = interaction.fields.getTextInputValue("description") || draft.description;
      const placeholder = interaction.fields.getTextInputValue("placeholder") || draft.placeholder;
      const color = interaction.fields.getTextInputValue("color") || draft.color;
      const footer = interaction.fields.getTextInputValue("footer") || draft.footer;

      const next = patchPending(interaction.guildId, interaction.user.id, {
        title: title.slice(0, 256),
        description: description.slice(0, 4000),
        placeholder: placeholder.slice(0, 100),
        color: color.slice(0, 32),
        footer: footer.slice(0, 2048),
      });

      await interaction.update(buildWizardPayload(next, "Style mis à jour."));
      return true;
    }

    if (interaction.customId === AUTOROLE_IDS.MODAL_DURATION) {
      const minutesRaw = interaction.fields.getTextInputValue("minutes");
      const minutes = Math.max(1, Math.min(60 * 24 * 30, Number(minutesRaw || 60))); // 1 min -> 30 jours
      const next = patchPending(interaction.guildId, interaction.user.id, { durationMs: minutes * 60 * 1000 });

      await interaction.update(buildWizardPayload(next, "Durée mise à jour."));
      return true;
    }

    return false;
  }

  // ====== WIZARD: selects ======
  if (interaction.isRoleSelectMenu?.() && interaction.customId === AUTOROLE_IDS.WIZ_ROLE_SELECT) {
    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return true;
    }

    const draft = getPending(interaction.guildId, interaction.user.id);
    if (!draft) {
      await interaction.reply({ content: "❌ Wizard expiré. Relance `/autorole create`.", flags: EPHEMERAL });
      return true;
    }

    const roleIds = (interaction.values || []).map(String).slice(0, 25);
    const next = patchPending(interaction.guildId, interaction.user.id, { roleIds });

    await interaction.update(buildWizardPayload(next, "Rôles mis à jour."));
    return true;
  }

  if (interaction.isChannelSelectMenu?.() && interaction.customId === AUTOROLE_IDS.WIZ_CHANNEL_SELECT) {
    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return true;
    }

    const draft = getPending(interaction.guildId, interaction.user.id);
    if (!draft) {
      await interaction.reply({ content: "❌ Wizard expiré. Relance `/autorole create`.", flags: EPHEMERAL });
      return true;
    }

    const channelId = interaction.values?.[0] || null;
    const next = patchPending(interaction.guildId, interaction.user.id, { channelId });

    await interaction.update(buildWizardPayload(next, "Salon cible mis à jour."));
    return true;
  }

  // ====== WIZARD: buttons ======
  if (interaction.isButton?.()) {
    const id = interaction.customId;
    const allowed = new Set([
      AUTOROLE_IDS.WIZ_TOGGLE_MODE,
      AUTOROLE_IDS.WIZ_TOGGLE_MULTI,
      AUTOROLE_IDS.WIZ_TOGGLE_REPLACEMENT,
      AUTOROLE_IDS.WIZ_TOGGLE_TEMP,
      AUTOROLE_IDS.WIZ_EDIT_STYLE,
      AUTOROLE_IDS.WIZ_EDIT_DURATION,
      AUTOROLE_IDS.WIZ_PUBLISH,
      AUTOROLE_IDS.WIZ_CANCEL,
    ]);
    if (!allowed.has(id)) return false;

    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return true;
    }

    const draft = getPending(interaction.guildId, interaction.user.id);
    if (!draft) {
      await interaction.reply({ content: "❌ Wizard expiré. Relance `/autorole create`.", flags: EPHEMERAL });
      return true;
    }

    if (id === AUTOROLE_IDS.WIZ_CANCEL) {
      clearPending(interaction.guildId, interaction.user.id);
      await interaction.update({
        embeds: [{ title: "🗑️ Annulé", description: "Relance `/autorole create` quand tu veux." }],
        components: [],
      });
      return true;
    }

    if (id === AUTOROLE_IDS.WIZ_TOGGLE_MODE) {
      const next = patchPending(interaction.guildId, interaction.user.id, {
        mode: draft.mode === "add" ? "toggle" : "add",
      });
      await interaction.update(buildWizardPayload(next, "Mode changé."));
      return true;
    }

    if (id === AUTOROLE_IDS.WIZ_TOGGLE_MULTI) {
      const next = patchPending(interaction.guildId, interaction.user.id, { multi: !draft.multi });
      await interaction.update(buildWizardPayload(next, "Paramètre multi changé."));
      return true;
    }

    if (id === AUTOROLE_IDS.WIZ_TOGGLE_REPLACEMENT) {
      const next = patchPending(interaction.guildId, interaction.user.id, { remplacement: !draft.remplacement });
      await interaction.update(buildWizardPayload(next, "Remplacement changé."));
      return true;
    }

    if (id === AUTOROLE_IDS.WIZ_TOGGLE_TEMP) {
      const next = patchPending(interaction.guildId, interaction.user.id, { temporary: !draft.temporary });
      await interaction.update(buildWizardPayload(next, "Temporaire changé."));
      return true;
    }

    if (id === AUTOROLE_IDS.WIZ_EDIT_STYLE) {
      const modal = new ModalBuilder().setCustomId(AUTOROLE_IDS.MODAL_STYLE).setTitle("🎨 Style du menu");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("title").setLabel("Titre").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(256).setValue(String(draft.title || ""))
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("description").setLabel("Description").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(4000).setValue(String(draft.description || ""))
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("placeholder").setLabel("Placeholder du menu").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(String(draft.placeholder || ""))
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("color").setLabel("Couleur HEX (#CBA135)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(32).setValue(String(draft.color || ""))
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("footer").setLabel("Footer").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(2048).setValue(String(draft.footer || ""))
        )
      );

      await interaction.showModal(modal);
      return true;
    }

    if (id === AUTOROLE_IDS.WIZ_EDIT_DURATION) {
      if (!draft.temporary) {
        await interaction.reply({ content: "⚠️ Active d’abord le mode **Temporaire**.", flags: EPHEMERAL });
        return true;
      }

      const minutes = Math.max(1, Math.round((Number(draft.durationMs || 0) / 60000) || 60));

      const modal = new ModalBuilder().setCustomId(AUTOROLE_IDS.MODAL_DURATION).setTitle("⏳ Durée (temporaire)");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("minutes")
            .setLabel("Durée en minutes (1 à 43200)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(String(minutes))
        )
      );

      await interaction.showModal(modal);
      return true;
    }

    if (id === AUTOROLE_IDS.WIZ_PUBLISH) {
      if (!draft.channelId) {
        await interaction.reply({ content: "❌ Choisis un salon cible.", flags: EPHEMERAL });
        return true;
      }
      if (!Array.isArray(draft.roleIds) || draft.roleIds.length === 0) {
        await interaction.reply({ content: "❌ Choisis au moins 1 rôle.", flags: EPHEMERAL });
        return true;
      }

      const channel = await interaction.guild.channels.fetch(draft.channelId).catch(() => null);
      if (!channel || !channel.isTextBased?.()) {
        await interaction.reply({ content: "❌ Salon invalide.", flags: EPHEMERAL });
        return true;
      }

      const config = {
        channelId: draft.channelId,
        roleIds: draft.roleIds.slice(0, 25),

        mode: draft.mode || "toggle",
        multi: !!draft.multi,
        remplacement: !!draft.remplacement,
        temporary: !!draft.temporary,
        durationMs: Number(draft.durationMs || 0) || 0,

        title: draft.title || "🎭 Autoroles",
        description: draft.description || "",
        placeholder: draft.placeholder || "Choisir un rôle…",
        color: draft.color || "#CBA135",
        footer: draft.footer || "Auto-rôles",

        createdBy: interaction.user.id,
        createdAt: draft?.meta?.createdAt || Date.now(),
      };

      const msg = await channel.send({
        embeds: [buildPublicEmbed(config)],
        components: buildPublicComponents(config),
      });

      upsertAutoroleMessage(interaction.guildId, msg.id, config);
      clearPending(interaction.guildId, interaction.user.id);

      await interaction.update({
        embeds: [{ title: "✅ Autorole publié", description: `Publié dans <#${channel.id}>.\nID: \`${msg.id}\`` }],
        components: [],
      });

      return true;
    }
  }

  return false;
}

module.exports = { handleAutoroleInteraction, buildWizardPayload, buildPublicEmbed, buildPublicComponents };
