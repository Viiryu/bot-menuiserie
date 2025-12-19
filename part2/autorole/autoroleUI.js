// part2/autorole/autoroleUI.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
  MessageFlagsBitField,
} = require("discord.js");

const { AUTOROLE_IDS } = require("./ids");
const { isStaff } = require("../permissions");
const {
  setPending,
  getPending,
  clearPending,
  upsertAutoroleMessage,
  getAutoroleMessage,
} = require("./autoroleState");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

function buildWizardEmbed(draft, statusText = null) {
  const modeLabel = draft.mode === "add" ? "➕ Add-only" : "🔁 Toggle (add/remove)";
  const rolesCount = Array.isArray(draft.roleIds) ? draft.roleIds.length : 0;

  const e = new EmbedBuilder()
    .setTitle("🎭 Autorole — Création (Wizard)")
    .setDescription(
      [
        "Choisis des rôles, un salon, puis **Publier**.",
        "Les membres utiliseront un menu pour recevoir (ou retirer) le rôle.",
        "",
        statusText ? `**Statut :** ${statusText}` : null,
      ].filter(Boolean).join("\n")
    )
    .addFields(
      { name: "🎯 Salon cible", value: draft.channelId ? `<#${draft.channelId}>` : "—", inline: true },
      { name: "⚙️ Mode", value: modeLabel, inline: true },
      { name: "🧩 Rôles", value: rolesCount ? `✅ ${rolesCount} rôle(s)` : "—", inline: true },
    )
    .setFooter({ text: "Astuce: le bot doit avoir Manage Roles + être au-dessus des rôles." })
    .setTimestamp(new Date());

  return e;
}

function buildPublicEmbed(config) {
  const modeLabel = config.mode === "add" ? "➕ Add-only" : "🔁 Toggle (add/remove)";
  return new EmbedBuilder()
    .setTitle("🎭 Autoroles")
    .setDescription(
      [
        "Sélectionne un rôle dans le menu pour te l’attribuer.",
        config.mode === "toggle"
          ? "➡️ Si tu l’as déjà, il sera **retiré** (toggle)."
          : "➡️ Add-only : tu peux **ajouter**, pas retirer via le menu.",
        "",
        `**Mode :** ${modeLabel}`,
      ].join("\n")
    )
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

  return [row1, row2, row3];
}

function buildPublicComponents(config) {
  const ids = Array.isArray(config.roleIds) ? config.roleIds.slice(0, 25) : [];
  const max = Math.max(1, Math.min(25, ids.length));

  const menu = new RoleSelectMenuBuilder()
    .setCustomId(AUTOROLE_IDS.PUBLIC_MENU)
    .setPlaceholder("🎭 Choisir ton/tes rôle(s)…")
    .setMinValues(1)
    .setMaxValues(max);

  return [new ActionRowBuilder().addComponents(menu)];
}

async function handleAutoroleInteraction(interaction) {
  // PUBLIC: members selecting roles
  if (interaction.isRoleSelectMenu && interaction.isRoleSelectMenu()) {
    if (interaction.customId !== AUTOROLE_IDS.PUBLIC_MENU) return false;

    try {
      const guildId = interaction.guildId;
      const messageId = interaction.message?.id;
      if (!guildId || !messageId) return false;

      const config = getAutoroleMessage(guildId, messageId);
      if (!config) {
        await interaction.reply({ content: "⚠️ Autorole non configuré (config introuvable).", flags: EPHEMERAL });
        return true;
      }

      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.reply({ content: "❌ Impossible de récupérer ton profil serveur.", flags: EPHEMERAL });
        return true;
      }

      const me = interaction.guild.members.me || (await interaction.guild.members.fetchMe().catch(() => null));
      if (!me?.permissions?.has?.("ManageRoles")) {
        await interaction.reply({ content: "❌ Le bot n’a pas la permission **Manage Roles**.", flags: EPHEMERAL });
        return true;
      }

      const allowed = new Set((config.roleIds || []).map(String));
      const picked = (interaction.values || []).map(String).filter((id) => allowed.has(id));

      if (!picked.length) {
        await interaction.reply({ content: "❌ Rôle non autorisé pour ce menu.", flags: EPHEMERAL });
        return true;
      }

      const added = [];
      const removed = [];
      const failed = [];

      for (const roleId of picked) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) {
          failed.push(roleId);
          continue;
        }

        // Le bot doit être au-dessus du rôle
        if (me.roles.highest.comparePositionTo(role) <= 0) {
          failed.push(`${role.name} (position)`);
          continue;
        }

        try {
          const has = member.roles.cache.has(roleId);

          if (config.mode === "add") {
            if (!has) {
              await member.roles.add(roleId, "Autorole menu");
              added.push(role.name);
            }
          } else {
            // toggle
            if (has) {
              await member.roles.remove(roleId, "Autorole menu");
              removed.push(role.name);
            } else {
              await member.roles.add(roleId, "Autorole menu");
              added.push(role.name);
            }
          }
        } catch (e) {
          failed.push(role.name);
        }
      }

      const lines = [];
      if (added.length) lines.push(`✅ Ajouté: **${added.join(", ")}**`);
      if (removed.length) lines.push(`➖ Retiré: **${removed.join(", ")}**`);
      if (failed.length) lines.push(`⚠️ Échec: **${failed.join(", ")}**`);

      await interaction.reply({
        content: lines.length ? lines.join("\n") : "✅ OK.",
        flags: EPHEMERAL,
      });

      return true;
    } catch (e) {
      console.error("[autorole] public menu error:", e);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "❌ Erreur interne (Autorole).", flags: EPHEMERAL }).catch(() => {});
      }
      return true;
    }
  }

  // WIZARD: staff selecting roles
  if (interaction.isRoleSelectMenu && interaction.isRoleSelectMenu()) {
    if (interaction.customId !== AUTOROLE_IDS.WIZ_ROLE_SELECT) return false;

    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return true;
    }

    const draft = getPending(interaction.guildId, interaction.user.id);
    if (!draft) {
      await interaction.reply({ content: "❌ Wizard expiré. Relance `/autorole create`.", flags: EPHEMERAL });
      return true;
    }

    draft.roleIds = (interaction.values || []).map(String).slice(0, 25);
    draft.updatedAt = Date.now();
    setPending(interaction.guildId, interaction.user.id, draft);

    const payload = {
      embeds: [buildWizardEmbed(draft, "Rôles mis à jour.")],
      components: buildWizardComponents(draft),
    };

    // IMPORTANT: pas de flags dans update()
    await interaction.update(payload);
    return true;
  }

  // WIZARD: staff selecting channel
  if (interaction.isChannelSelectMenu && interaction.isChannelSelectMenu()) {
    if (interaction.customId !== AUTOROLE_IDS.WIZ_CHANNEL_SELECT) return false;

    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return true;
    }

    const draft = getPending(interaction.guildId, interaction.user.id);
    if (!draft) {
      await interaction.reply({ content: "❌ Wizard expiré. Relance `/autorole create`.", flags: EPHEMERAL });
      return true;
    }

    draft.channelId = interaction.values?.[0] || null;
    draft.updatedAt = Date.now();
    setPending(interaction.guildId, interaction.user.id, draft);

    await interaction.update({
      embeds: [buildWizardEmbed(draft, "Salon cible mis à jour.")],
      components: buildWizardComponents(draft),
    });
    return true;
  }

  // WIZARD: buttons
  if (interaction.isButton && interaction.isButton()) {
    const id = interaction.customId;
    if (![AUTOROLE_IDS.WIZ_TOGGLE_MODE, AUTOROLE_IDS.WIZ_PUBLISH, AUTOROLE_IDS.WIZ_CANCEL].includes(id)) {
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

    if (id === AUTOROLE_IDS.WIZ_CANCEL) {
      clearPending(interaction.guildId, interaction.user.id);
      await interaction.update({
        embeds: [{ title: "🗑️ Annulé", description: "Relance `/autorole create` quand tu veux." }],
        components: [],
      });
      return true;
    }

    if (id === AUTOROLE_IDS.WIZ_TOGGLE_MODE) {
      draft.mode = draft.mode === "add" ? "toggle" : "add";
      draft.updatedAt = Date.now();
      setPending(interaction.guildId, interaction.user.id, draft);

      await interaction.update({
        embeds: [buildWizardEmbed(draft, "Mode changé.")],
        components: buildWizardComponents(draft),
      });
      return true;
    }

    // Publish
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
      if (!channel || !channel.isTextBased()) {
        await interaction.reply({ content: "❌ Salon invalide.", flags: EPHEMERAL });
        return true;
      }

      const config = {
        channelId: draft.channelId,
        roleIds: draft.roleIds.slice(0, 25),
        mode: draft.mode || "toggle",
        createdBy: interaction.user.id,
        createdAt: draft.createdAt || Date.now(),
      };

      const msg = await channel.send({
        embeds: [buildPublicEmbed(config)],
        components: buildPublicComponents(config),
      });

      upsertAutoroleMessage(interaction.guildId, msg.id, config);
      clearPending(interaction.guildId, interaction.user.id);

      await interaction.update({
        embeds: [
          {
            title: "✅ Autorole publié",
            description: `Publié dans <#${channel.id}>.\nID: \`${msg.id}\``,
          },
        ],
        components: [],
      });

      return true;
    }
  }

  return false;
}

function startAutorole(client) {
  // rien à scheduler, mais on expose une fonction si tu veux étendre
}

module.exports = { handleAutoroleInteraction, startAutorole };
