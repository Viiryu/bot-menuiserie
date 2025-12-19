// part2/staff/staffActions.js
const { writeAudit, sendAuditEmbed, buildAuditEmbed } = require("../logging/auditLogger");
const { getGuildConfig } = require("./staffConfigState");

function parseUserId(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^<@!?(\d+)>$/);
  if (m) return m[1];
  const n = s.match(/^(\d{15,25})$/);
  return n ? n[1] : null;
}

function parseDurationMs(raw) {
  // supports: 10m, 2h, 1d, 30s
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  const m = s.match(/^(\d+)\s*([smhd])$/);
  if (!m) return null;
  const val = parseInt(m[1], 10);
  const unit = m[2];
  const mult = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return val * mult;
}

async function getLogChannels(guild) {
  const cfg = getGuildConfig(guild.id);
  const logs = cfg.logsChannelId ? await guild.channels.fetch(cfg.logsChannelId).catch(() => null) : null;
  const modLogs = cfg.modLogsChannelId ? await guild.channels.fetch(cfg.modLogsChannelId).catch(() => null) : null;
  return { cfg, logs, modLogs };
}

async function audit(interaction, { module, action, ok, details, embed }) {
  const guildId = interaction.guildId;
  const userId = interaction.user?.id;
  writeAudit({ guildId, userId, module, action, ok, details });

  const guild = interaction.guild;
  if (!guild) return;

  const { logs } = await getLogChannels(guild);
  if (logs) {
    const payload = embed || buildAuditEmbed({
      title: `${action} — ${ok ? "OK" : "ERREUR"}`,
      emoji: ok ? "✅" : "❌",
      fields: [
        { name: "👤 Staff", value: `<@${userId}>`, inline: true },
        { name: "🧩 Module", value: module, inline: true },
        { name: "📌 Détails", value: String(details || "—").slice(0, 1024), inline: false },
      ],
    });
    await sendAuditEmbed(logs, payload);
  }
}

module.exports = {
  parseUserId,
  parseDurationMs,
  getLogChannels,
  audit,
};
