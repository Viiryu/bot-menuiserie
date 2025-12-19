const { MessageFlagsBitField } = require("discord.js");
const { getAutoroleMenu } = require("./autoroleState");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;
const AUTOROLE_CUSTOM_ID = "P2_AUTOROLE_MENU";

function canManageRole(botMember, role) {
  if (!botMember?.permissions?.has?.("ManageRoles")) return false;
  const botTop = botMember.roles.highest;
  return botTop && role.position < botTop.position;
}

async function handleAutoroleComponents(interaction) {
  if (!interaction.isStringSelectMenu()) return false;
  if (interaction.customId !== AUTOROLE_CUSTOM_ID) return false;

  try {
    const menu = getAutoroleMenu(interaction.message.id);
    if (!menu) {
      await interaction.reply({ content: "⚠️ Ce menu auto-rôle n’est plus actif.", flags: EPHEMERAL });
      return true;
    }

    const member = interaction.member; // GuildMember
    const guild = interaction.guild;
    if (!guild || !member) return false;

    const botMember = await guild.members.fetchMe().catch(() => null);
    if (!botMember) {
      await interaction.reply({ content: "❌ Impossible: botMember introuvable.", flags: EPHEMERAL });
      return true;
    }

    const selected = interaction.values || [];
    const allowed = new Set(menu.roleIds || []);

    // sécurité: si quelqu’un injecte autre chose
    for (const rid of selected) {
      if (!allowed.has(rid)) {
        await interaction.reply({ content: "❌ Rôle non autorisé par ce menu.", flags: EPHEMERAL });
        return true;
      }
    }

    const results = [];
    for (const roleId of selected) {
      const role = guild.roles.cache.get(roleId);
      if (!role) {
        results.push(`⚠️ Rôle introuvable: ${roleId}`);
        continue;
      }

      if (!canManageRole(botMember, role)) {
        results.push(`⛔ Je ne peux pas gérer **${role.name}** (permissions / position du rôle).`);
        continue;
      }

      const has = member.roles.cache.has(roleId);
      if (has) {
        await member.roles.remove(roleId).catch(() => null);
        results.push(`➖ Retiré: **${role.name}**`);
      } else {
        await member.roles.add(roleId).catch(() => null);
        results.push(`➕ Ajouté: **${role.name}**`);
      }
    }

    if (results.length === 0) results.push("—");

    await interaction.reply({
      content: `✅ Auto-rôle:\n${results.map((x) => `• ${x}`).join("\n")}`,
      flags: EPHEMERAL,
    });

    return true;
  } catch (e) {
    console.error("[autoroleComponents] error:", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Erreur interne auto-rôle.", flags: EPHEMERAL }).catch(() => {});
    }
    return true;
  }
}

module.exports = { handleAutoroleComponents, AUTOROLE_CUSTOM_ID };
