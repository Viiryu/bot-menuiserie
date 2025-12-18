const { computeDue, bumpNextRun } = require("./schedulerState");
const { EmbedBuilder } = require("discord.js");
const { parseHexColor, cut } = require("../util");

let _timer = null;
const QUEUE = []; // schedule objects
const INQUEUE = new Set(); // `${guildId}:${id}`

const MAX_SENDS_PER_TICK = 3;

function _buildEmbed(payload) {
  const e = payload || {};
  const embed = new EmbedBuilder();

  if (e.title) embed.setTitle(e.title);
  if (e.description) embed.setDescription(e.description);

  const c = parseHexColor(e.colorRaw || "");
  if (c !== null) embed.setColor(c);

  if (e.authorName) embed.setAuthor({ name: e.authorName, iconURL: e.authorIcon || undefined });
  if (e.footerText) embed.setFooter({ text: e.footerText, iconURL: e.footerIcon || undefined });

  if (e.thumbnail) embed.setThumbnail(e.thumbnail);
  if (e.image) embed.setImage(e.image);

  if (e.timestamp) embed.setTimestamp(new Date());

  if (Array.isArray(e.fields) && e.fields.length) {
    embed.setFields(
      e.fields.slice(0, 25).map((f) => ({
        name: cut(f.name || " ", 256),
        value: cut(f.value || " ", 1024),
        inline: !!f.inline,
      }))
    );
  }

  return embed;
}

async function sendOnce(client, sched) {
  const channel = await client.channels.fetch(sched.channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) {
    sched.lastError = "Channel introuvable ou non textuel";
    return { ok: false, error: sched.lastError };
  }

  const ping = (sched.ping || "").trim();
  const pingContent = ping ? ping.slice(0, 2000) : undefined;

  if (sched.type === "text") {
    const content = String(sched.payload?.content || "").slice(0, 2000);
    if (!content) return { ok: false, error: "Contenu vide" };
    await channel.send({ content: pingContent ? `${pingContent}\n${content}` : content });
    return { ok: true };
  }

  if (sched.type === "embed") {
    const embed = _buildEmbed(sched.payload);
    await channel.send({ content: pingContent, embeds: [embed] });
    return { ok: true };
  }

  return { ok: false, error: "Type inconnu" };
}

function _key(s) {
  return `${s.guildId}:${s.id}`;
}

function startScheduler(client, { tickMs = 5000 } = {}) {
  if (_timer) return;

  _timer = setInterval(async () => {
    const now = Date.now();

    // 1) push due into queue (without duplicates)
    const due = computeDue(now);
    for (const s of due) {
      const k = _key(s);
      if (!INQUEUE.has(k)) {
        INQUEUE.add(k);
        QUEUE.push(s);
      }
    }

    // 2) process queue with cap
    let sent = 0;
    while (QUEUE.length && sent < MAX_SENDS_PER_TICK) {
      const sched = QUEUE.shift();
      INQUEUE.delete(_key(sched));

      try {
        const res = await sendOnce(client, sched);
        if (!res.ok) {
          sched.lastError = res.error || "Erreur inconnue";
        } else {
          sched.lastError = null;
          sched.runs += 1;
          sched.lastRunAt = now;
        }
      } catch (e) {
        sched.lastError = String(e?.message || e);
      } finally {
        bumpNextRun(sched, now);
      }

      sent++;
    }
  }, Math.max(1000, tickMs));

  _timer.unref?.();
}

function stopScheduler() {
  if (_timer) clearInterval(_timer);
  _timer = null;
}

module.exports = { startScheduler, stopScheduler, sendOnce };
