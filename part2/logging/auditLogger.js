// part2/logging/auditLogger.js
const fs = require("fs");
const path = require("path");

const LOG_PATH = path.join(__dirname, "audit.log.jsonl"); // JSON lines

function nowISO() {
  return new Date().toISOString();
}

/**
 * Write one audit entry to disk (JSONL).
 * entry: { ts, guildId, userId, action, module, ok, details, meta }
 */
function writeAudit(entry) {
  try {
    const line = JSON.stringify({ ts: nowISO(), ...entry }) + "\n";
    fs.appendFileSync(LOG_PATH, line, "utf8");
  } catch (e) {
    console.error("[auditLogger] write error:", e);
  }
}

function safeShort(str, max = 500) {
  if (!str) return "";
  const s = String(str);
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/**
 * Send an audit embed to a channel if configured.
 * You pass the channel already fetched to avoid extra API calls.
 */
async function sendAuditEmbed(channel, payload) {
  try {
    if (!channel || !channel.isTextBased?.()) return;
    await channel.send(payload);
  } catch (e) {
    // don't throw
  }
}

/**
 * Build an audit embed payload (premium but compact).
 */
function buildAuditEmbed({ title, emoji = "🧾", color = 0xCBA135, fields = [], footer = "Audit — Le Secrétaire" }) {
  return {
    embeds: [
      {
        title: `${emoji} ${safeShort(title, 250)}`,
        color,
        fields: fields.slice(0, 25),
        footer: { text: footer },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

module.exports = {
  writeAudit,
  sendAuditEmbed,
  buildAuditEmbed,
};
