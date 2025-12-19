// part2/staff/staffModerationModals.js
const { MessageFlagsBitField } = require("discord.js");
const { STAFF_IDS } = require("./ids");
const { isStaff } = require("../permissions");
const { parseUserId, parseDurationMs, audit } = require("./staffActions");
const { getGuildConfig } = require("./staffConfigState");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

async function handleStaffModerationModals(interaction) {
  if (!interaction.isModalSubmit?.() || !interaction.isModalSubmit()) return false;

  const cid = interaction.customId;
  if (![STAFF_IDS.MODAL_WARN, STAFF_IDS.MODAL_TIMEOUT, STAFF_IDS.MODAL_KICK, STAFF_IDS.MODAL_BAN, STAFF_IDS.MODAL_PURGE].includes(cid)) {
    return false;
  }

  try {
    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return true;
    }

    const cfg = getGuildConfig(interaction.guildId);
    if (cfg.maintenance && cid !== STAFF_IDS.MODAL_WARN) {
      await interaction.reply({ content: "🧯 Maintenance ON : action bloquée.", flags: EPHEMERAL });
      return true;
    }

    const guild = interaction.guild;

    // WARN (pas de sanctions natives) => log + DM optionnel
    if (cid === STAFF_IDS.MODAL_WARN) {
      const targetRaw = interaction.fields.getTextInputValue("target") || "";
      const reason = interaction.fields.getTextInputValue("reason") || "";
      const targetId = parseUserId(targetRaw);

      if (!targetId) {
        await interaction.reply({ content: "❌ Cible invalide (mention ou ID).", flags: EPHEMERAL });
        return true;
      }

      const member = await guild.members.fetch(targetId).catch(() => null);
      if (!member) {
        await interaction.reply({ content: "❌ Membre introuvable sur le serveur.", flags: EPHEMERAL });
        return true;
      }

      // DM best-effort
      await member.send(`⚠️ **Warn** sur **${guild.name}**\nRaison: ${reason || "—"}`).catch(() => null);

      await audit(interaction, {
        module: "moderation",
        action: "warn",
        ok: true,
        details: `target=${targetId} reason=${(reason || "—").slice(0,120)}`,
      });

      await interaction.reply({ content: `✅ Warn envoyé à <@${targetId}>.`, flags: EPHEMERAL });
      return true;
    }

    // TIMEOUT
    if (cid === STAFF_IDS.MODAL_TIMEOUT) {
      const targetRaw = interaction.fields.getTextInputValue("target") || "";
      const durationRaw = interaction.fields.getTextInputValue("duration") || "";
      const reason = interaction.fields.getTextInputValue("reason") || "";
      const targetId = parseUserId(targetRaw);
      const ms = parseDurationMs(durationRaw);

      if (!targetId || !ms) {
        await interaction.reply({ content: "❌ Cible ou durée invalide (ex: 10m / 2h / 1d).", flags: EPHEMERAL });
        return true;
      }

      const member = await guild.members.fetch(targetId).catch(() => null);
      if (!member) {
        await interaction.reply({ content: "❌ Membre introuvable.", flags: EPHEMERAL });
        return true;
      }

      await member.timeout(ms, reason || undefined);

      await audit(interaction, {
        module: "moderation",
        action: "timeout",
        ok: true,
        details: `target=${targetId} duration=${durationRaw} reason=${(reason || "—").slice(0,120)}`,
      });

      await interaction.reply({ content: `✅ Timeout appliqué à <@${targetId}> pour **${durationRaw}**.`, flags: EPHEMERAL });
      return true;
    }

    // KICK
    if (cid === STAFF_IDS.MODAL_KICK) {
      const targetRaw = interaction.fields.getTextInputValue("target") || "";
      const reason = interaction.fields.getTextInputValue("reason") || "";
      const targetId = parseUserId(targetRaw);

      if (!targetId) {
        await interaction.reply({ content: "❌ Cible invalide.", flags: EPHEMERAL });
        return true;
      }

      const member = await guild.members.fetch(targetId).catch(() => null);
      if (!member) {
        await interaction.reply({ content: "❌ Membre introuvable.", flags: EPHEMERAL });
        return true;
      }

      await member.kick(reason || undefined);

      await audit(interaction, {
        module: "moderation",
        action: "kick",
        ok: true,
        details: `target=${targetId} reason=${(reason || "—").slice(0,120)}`,
      });

      await interaction.reply({ content: `✅ Kick effectué sur <@${targetId}>.`, flags: EPHEMERAL });
      return true;
    }

    // BAN
    if (cid === STAFF_IDS.MODAL_BAN) {
      const targetRaw = interaction.fields.getTextInputValue("target") || "";
      const reason = interaction.fields.getTextInputValue("reason") || "";
      const targetId = parseUserId(targetRaw);

      if (!targetId) {
        await interaction.reply({ content: "❌ Cible invalide.", flags: EPHEMERAL });
        return true;
      }

      await guild.members.ban(targetId, { reason: reason || undefined });

      await audit(interaction, {
        module: "moderation",
        action: "ban",
        ok: true,
        details: `target=${targetId} reason=${(reason || "—").slice(0,120)}`,
      });

      await interaction.reply({ content: `✅ Ban effectué sur <@${targetId}>.`, flags: EPHEMERAL });
      return true;
    }

    // PURGE
    if (cid === STAFF_IDS.MODAL_PURGE) {
      const amountRaw = interaction.fields.getTextInputValue("amount") || "";
      const userRaw = interaction.fields.getTextInputValue("user") || "";
      const reason = interaction.fields.getTextInputValue("reason") || "";

      const amount = parseInt(amountRaw, 10);
      if (!amount || amount < 1 || amount > 100) {
        await interaction.reply({ content: "❌ Nombre invalide (1-100).", flags: EPHEMERAL });
        return true;
      }

      const channel = interaction.channel;
      if (!channel?.isTextBased?.()) {
        await interaction.reply({ content: "❌ Salon invalide.", flags: EPHEMERAL });
        return true;
      }

      const userId = parseUserId(userRaw);
      const fetched = await channel.messages.fetch({ limit: amount }).catch(() => null);
      if (!fetched) {
        await interaction.reply({ content: "❌ Impossible de récupérer les messages.", flags: EPHEMERAL });
        return true;
      }

      const toDelete = userId ? fetched.filter((m) => m.author?.id === userId) : fetched;
      const deleted = await channel.bulkDelete(toDelete, true).catch(() => null);

      const delCount = deleted ? deleted.size : 0;

      await audit(interaction, {
        module: "moderation",
        action: "purge",
        ok: true,
        details: `channel=${channel.id} amount=${amount} filterUser=${userId || "none"} deleted=${delCount} reason=${(reason || "—").slice(0,80)}`,
      });

      await interaction.reply({
        content:
          `✅ Purge terminée.\n• Demandé: ${amount}\n• Supprimés: ${delCount}\n` +
          (userId ? `• Filtre: <@${userId}>\n` : "") +
          `⚠️ Discord ignore les messages > 14 jours.`,
        flags: EPHEMERAL,
      });
      return true;
    }

    return false;
  } catch (e) {
    console.error("[staffModerationModals] error:", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Erreur interne (Modération).", flags: EPHEMERAL }).catch(() => {});
    }
    return true;
  }
}

module.exports = { handleStaffModerationModals };
