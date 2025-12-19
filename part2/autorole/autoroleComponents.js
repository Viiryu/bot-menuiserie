// part2/autorole/autoroleComponents.js
const { MessageFlagsBitField } = require("discord.js");
const { AUTOROLE_IDS } = require("./ids");
const { getAutoroleMessage } = require("./autoroleState");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

function canManageRole(botMember, role) {
  if (!botMember?.permissions?.has?.("ManageRoles")) return false;
  const botTop = botMember.roles.highest;
  return botTop && role.position < botTop.position;
}

async function handleAutoroleComponents(interaction) {
  if (!interaction.isRoleSelectMenu?.()) return false;
  if (interaction.customId !== AUTOROLE_IDS.PUBLIC_MENU) return false;

  try {
    const guild = interaction.guild;
    if (!guild) return false;

    const config = getAutoroleMessage(interaction.guildId, interaction.message.id);
    if (!config) {
      await interaction.reply({ content: "⚠️ Ce menu auto-rôle n’est plus actif.", flags: EPHEMERAL });
      return true;
    }

    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: "❌ Impossible de récupérer ton profil serveur.", flags: EPHEMERAL });
      return true;
    }

    const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
    if (!botMember) {
      await interaction.reply({ content: "❌ Impossible: botMember introuvable.", flags: EPHEMERAL });
      return true;
    }

    if (!botMember.permissions?.has?.("ManageRoles")) {
      await interaction.reply({ content: "❌ Le bot n’a pas la permission **Manage Roles**.", flags: EPHEMERAL });
      return true;
    }

    const allowed = new Set((config.roleIds || []).map(String));

    // rôles sélectionnés (filtrés sécurité)
    const picked = (interaction.values || []).map(String).filter((rid) => allowed.has(rid));
    if (!picked.length) {
      await interaction.reply({ content: "❌ Rôle non autorisé pour ce menu.", flags: EPHEMERAL });
      return true;
    }

    const added = [];
    const removed = [];
    const failed = [];

    // si remplacement: enlever tous les autres rôles autorisés non sélectionnés
    if (config.remplacement) {
      for (const rid of allowed) {
        if (picked.includes(rid)) continue;
        if (!member.roles.cache.has(rid)) continue;

        const role = guild.roles.cache.get(rid);
        if (!role) continue;
        if (!canManageRole(botMember, role)) continue;

        await member.roles.remove(rid, "Autorole: remplacement").catch(() => null);
      }
    }

    for (const roleId of picked) {
      const role = guild.roles.cache.get(roleId);
      if (!role) {
        failed.push(roleId);
        continue;
      }

      if (!canManageRole(botMember, role)) {
        failed.push(`${role.name} (permissions/position)`);
        continue;
      }

      const has = member.roles.cache.has(roleId);

      if (config.mode === "add") {
        if (!has) {
          await member.roles.add(roleId, "Autorole menu").catch(() => null);
          added.push(role.name);
        }
      } else {
        // toggle
        if (has) {
          await member.roles.remove(roleId, "Autorole menu").catch(() => null);
          removed.push(role.name);
        } else {
          await member.roles.add(roleId, "Autorole menu").catch(() => null);
          added.push(role.name);
        }
      }
    }

    const lines = [];
    if (added.length) lines.push(`✅ Ajouté: **${added.join(", ")}**`);
    if (removed.length) lines.push(`➖ Retiré: **${removed.join(", ")}**`);
    if (failed.length) lines.push(`⚠️ Échec: **${failed.join(", ")}**`);

    // ⚠️ temporaire: ici on indique juste l’info (si tu veux timer persistant, je te le code aussi)
    if (config.temporary && added.length) {
      lines.push(`⏳ Temporaire activé: ces rôles sont prévus pour expirer (**${Math.round((config.durationMs || 0) / 60000)} min**).`);
      // (Timer persistant à ajouter si tu veux, sinon c’est “best effort”)
    }

    await interaction.reply({ content: lines.length ? lines.join("\n") : "✅ OK.", flags: EPHEMERAL });
    return true;
  } catch (e) {
    console.error("[autoroleComponents] error:", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Erreur interne auto-rôle.", flags: EPHEMERAL }).catch(() => {});
    }
    return true;
  }
}

module.exports = { handleAutoroleComponents };
