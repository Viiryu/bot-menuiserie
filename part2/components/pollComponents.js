// part2/components/pollComponents.js
// Système de sondage simple (buttons) géré côté bot.
// ⚠️ état en mémoire (reset au redémarrage) - suffisant pour un poll de serveur RP.

const { MessageFlagsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

const POLL_PREFIX = "P2_POLL";
const _polls = new Map(); // pollId -> { messageId, channelId, guildId, question, options:[], votes: Map(userId->idx) }

function makePollId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function buildPollEmbed(poll) {
  const counts = new Array(poll.options.length).fill(0);
  for (const idx of poll.votes.values()) {
    if (idx >= 0 && idx < counts.length) counts[idx]++;
  }
  const total = [...poll.votes.keys()].length || 0;

  const e = new EmbedBuilder()
    .setTitle("📊 Sondage")
    .setDescription(`**${poll.question}**`)
    .setTimestamp(new Date())
    .setFooter({ text: "Vote = toggle • Le Secrétaire" });

  const lines = poll.options.map((opt, i) => {
    const c = counts[i] || 0;
    const pct = total ? Math.round((c / total) * 100) : 0;
    return `**${i + 1}.** ${opt} — **${c}** vote(s) (${pct}%)`;
  });

  e.addFields({ name: "Résultats", value: lines.join("\n").slice(0, 1024) || "—" });
  e.addFields({ name: "Total", value: `${total} participant(s)`, inline: true });

  return e;
}

function buildPollComponents(pollId, optionsLen) {
  const row = new ActionRowBuilder();
  for (let i = 0; i < optionsLen; i++) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${POLL_PREFIX}:${pollId}:${i}`)
        .setLabel(String(i + 1))
        .setStyle(ButtonStyle.Secondary)
    );
  }
  return [row];
}

function createPollMessagePayload(pollId, poll) {
  return {
    embeds: [buildPollEmbed(poll)],
    components: buildPollComponents(pollId, poll.options.length),
  };
}

function registerPoll(pollId, poll) {
  _polls.set(pollId, poll);
}

async function handlePollComponents(interaction) {
  if (!interaction.isButton()) return false;
  const cid = interaction.customId || "";
  if (!cid.startsWith(POLL_PREFIX + ":")) return false;

  try {
    const [, pollId, idxRaw] = cid.split(":");
    const poll = _polls.get(pollId);
    if (!poll) {
      await interaction.reply({ content: "⚠️ Ce sondage n’est plus actif (redémarrage bot ?).", flags: EPHEMERAL });
      return true;
    }

    const idx = Number(idxRaw);
    if (!Number.isFinite(idx) || idx < 0 || idx >= poll.options.length) {
      await interaction.reply({ content: "❌ Option invalide.", flags: EPHEMERAL });
      return true;
    }

    const userId = interaction.user.id;

    // toggle: si déjà voté sur cette option -> remove
    const prev = poll.votes.get(userId);
    if (prev === idx) poll.votes.delete(userId);
    else poll.votes.set(userId, idx);

    // update embed
    const payload = createPollMessagePayload(pollId, poll);

    await interaction.update(payload).catch(async () => {
      // si update impossible (ex: interaction expired), fallback edit
      const ch = await interaction.guild?.channels.fetch(poll.channelId).catch(() => null);
      const msg = await ch?.messages.fetch(poll.messageId).catch(() => null);
      if (msg) await msg.edit(payload).catch(() => null);
    });

    // confirm ephemeral
    const optName = poll.options[idx];
    const text = prev === idx ? `➖ Vote retiré: **${optName}**` : `➕ Vote enregistré: **${optName}**`;
    if (!interaction.replied && !interaction.deferred) {
      await interaction.followUp({ content: text, flags: EPHEMERAL }).catch(() => {});
    }

    return true;
  } catch (e) {
    console.error("[pollComponents] error:", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Erreur interne sondage.", flags: EPHEMERAL }).catch(() => {});
    }
    return true;
  }
}

module.exports = {
  makePollId,
  registerPoll,
  createPollMessagePayload,
  handlePollComponents,
};
