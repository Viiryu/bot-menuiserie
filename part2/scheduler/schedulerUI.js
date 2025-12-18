const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlagsBitField,
} = require("discord.js");

const { IDS } = require("../constants");
const { setSession, getSession } = require("./schedulerUIState");
const {
  listSchedules,
  getSchedule,
  pauseSchedule,
  resumeSchedule,
  removeSchedule,
  runNowSchedule,
} = require("./schedulerState");
const { sendOnce } = require("./schedulerRunner");
const { isStaff } = require("../permissions");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

function unix(ms) {
  return ms ? Math.floor(ms / 1000) : null;
}

function fmtTime(ms) {
  const u = unix(ms);
  return u ? `<t:${u}:R>  _( <t:${u}:f> )_` : "—";
}

function summarize(s) {
  const everyMin = Math.max(1, Math.round((s.everyMs || 0) / 60000));
  const status = s.paused ? "⏸️ Pause" : "✅ Actif";
  const err = s.lastError ? `⚠️ ${String(s.lastError).slice(0, 180)}` : "—";
  const ping = s.ping ? `\`${String(s.ping).slice(0, 120)}\`` : "—";
  return { everyMin, status, err, ping };
}

function buildManagerEmbed(guildId, selected) {
  const all = listSchedules(guildId);
  const active = all.filter((s) => !s.paused).length;
  const paused = all.filter((s) => s.paused).length;

  const embed = new EmbedBuilder()
    .setTitle("🗓️ Scheduler Manager")
    .setDescription(
      [
        `**Total :** ${all.length}  •  **Actifs :** ${active}  •  **En pause :** ${paused}`,
        "",
        "Sélectionne un scheduler, puis utilise les boutons :",
        "• **Test** = envoie 1 fois maintenant",
        "• **Pause/Reprendre**",
        "• **Run now** = force la prochaine exécution",
        "• **Stop** = supprime",
      ].join("\n")
    )
    .setTimestamp(new Date());

  if (!selected) {
    embed.addFields({
      name: "Aucun scheduler",
      value: "Crée-en un avec `/schedule create` puis reviens ici avec `/schedule list`.",
    });
    return embed;
  }

  const info = summarize(selected);

  embed.addFields(
    { name: "ID", value: `#${selected.id}`, inline: true },
    { name: "Type", value: selected.type === "embed" ? "🧩 Embed" : "📝 Texte", inline: true },
    { name: "Statut", value: info.status, inline: true },

    { name: "Salon", value: `<#${selected.channelId}>`, inline: true },
    { name: "Intervalle", value: `⏱️ ${info.everyMin} min`, inline: true },
    { name: "Prochaine exécution", value: fmtTime(selected.nextRunAt), inline: false },

    { name: "Runs", value: String(selected.runs || 0), inline: true },
    { name: "Dernière exécution", value: selected.lastRunAt ? fmtTime(selected.lastRunAt) : "—", inline: true },
    { name: "Ping", value: info.ping, inline: true },

    { name: "Dernière erreur", value: info.err, inline: false }
  );

  return embed;
}

function buildSelectMenu(guildId, selectedId) {
  const all = listSchedules(guildId).slice(0, 25);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(IDS.SCHED_UI_SELECT)
    .setPlaceholder(all.length ? "Choisir un scheduler…" : "Aucun scheduler")
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(!all.length);

  // IMPORTANT: Discord exige 1..25 options même si disabled.
  if (!all.length) {
    menu.addOptions({ label: "Aucun scheduler", value: "none" });
  } else {
    for (const s of all) {
      const everyMin = Math.max(1, Math.round((s.everyMs || 0) / 60000));
      const status = s.paused ? "⏸️" : "✅";
      const label = `#${s.id} ${status} ${s.type === "embed" ? "Embed" : "Text"} • ${everyMin}m`;
      const desc = `Runs: ${s.runs || 0}`;
      menu.addOptions({
        label: label.slice(0, 100),
        description: desc.slice(0, 100),
        value: String(s.id),
        default: Number(selectedId) === Number(s.id),
      });
    }
  }

  return new ActionRowBuilder().addComponents(menu);
}

function buildButtons(selected) {
  const has = !!selected;
  const paused = !!selected?.paused;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.SCHED_UI_BTN_TEST)
      .setLabel("👁️ Test")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!has),

    new ButtonBuilder()
      .setCustomId(IDS.SCHED_UI_BTN_TOGGLE)
      .setLabel(paused ? "▶️ Reprendre" : "⏸️ Pause")
      .setStyle(paused ? ButtonStyle.Success : ButtonStyle.Primary)
      .setDisabled(!has),

    new ButtonBuilder()
      .setCustomId(IDS.SCHED_UI_BTN_RUNNOW)
      .setLabel("⚡ Run now")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!has),

    new ButtonBuilder()
      .setCustomId(IDS.SCHED_UI_BTN_STOP)
      .setLabel("🗑️ Stop")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!has),

    new ButtonBuilder()
      .setCustomId(IDS.SCHED_UI_BTN_REFRESH)
      .setLabel("🔄 Refresh")
      .setStyle(ButtonStyle.Secondary)
  );
}

async function openScheduleManager(interaction, { selectId } = {}) {
  if (!(await isStaff(interaction.member))) {
    return interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
  }

  const all = listSchedules(interaction.guildId);
  const initialId = Number(selectId) || all[0]?.id || null;

  setSession(interaction.user.id, interaction.guildId, initialId);

  const selected = initialId ? getSchedule(interaction.guildId, initialId) : null;

  const embed = buildManagerEmbed(interaction.guildId, selected);
  const menuRow = buildSelectMenu(interaction.guildId, initialId);
  const buttonsRow = buildButtons(selected);

  return interaction.reply({
    embeds: [embed],
    components: [menuRow, buttonsRow],
    flags: EPHEMERAL,
  });
}

async function handleScheduleUIInteraction(interaction) {
  const cid = String(interaction.customId || "");
  const isSelect = interaction.isStringSelectMenu() && cid === IDS.SCHED_UI_SELECT;
  const isBtn =
    interaction.isButton() &&
    [
      IDS.SCHED_UI_BTN_TEST,
      IDS.SCHED_UI_BTN_TOGGLE,
      IDS.SCHED_UI_BTN_RUNNOW,
      IDS.SCHED_UI_BTN_STOP,
      IDS.SCHED_UI_BTN_REFRESH,
    ].includes(cid);

  if (!isSelect && !isBtn) return false;

  try {
    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return true;
    }

    const sess = getSession(interaction.user.id);
    if (!sess || sess.guildId !== interaction.guildId) {
      // Recrée une session propre
      await openScheduleManager(interaction);
      return true;
    }

    let selectedId = sess.selectedId;

    if (isSelect) {
      const val = String(interaction.values?.[0] || "");
      selectedId = val === "none" ? null : Number(val) || null;
      setSession(interaction.user.id, interaction.guildId, selectedId);
    }

    let selected = selectedId ? getSchedule(interaction.guildId, selectedId) : null;

    if (isBtn && cid === IDS.SCHED_UI_BTN_TEST) {
      if (!selected) {
        await interaction.reply({ content: "❌ Aucun scheduler sélectionné.", flags: EPHEMERAL });
      } else {
        const res = await sendOnce(interaction.client, selected);
        await interaction.reply({
          content: res.ok ? `✅ Test envoyé pour #${selected.id}.` : `❌ Test échoué: ${res.error}`,
          flags: EPHEMERAL,
        });
      }
    }

    if (isBtn && cid === IDS.SCHED_UI_BTN_TOGGLE) {
      if (!selected) {
        await interaction.reply({ content: "❌ Aucun scheduler sélectionné.", flags: EPHEMERAL });
      } else {
        selected = selected.paused
          ? resumeSchedule(interaction.guildId, selected.id)
          : pauseSchedule(interaction.guildId, selected.id);

        await interaction.reply({
          content: selected?.paused ? `⏸️ #${selected.id} mis en pause.` : `▶️ #${selected.id} repris.`,
          flags: EPHEMERAL,
        });
      }
    }

    if (isBtn && cid === IDS.SCHED_UI_BTN_RUNNOW) {
      if (!selected) {
        await interaction.reply({ content: "❌ Aucun scheduler sélectionné.", flags: EPHEMERAL });
      } else {
        runNowSchedule(interaction.guildId, selected.id);
        await interaction.reply({ content: `⚡ #${selected.id} forcé (exécution imminente).`, flags: EPHEMERAL });
      }
    }

    if (isBtn && cid === IDS.SCHED_UI_BTN_STOP) {
      if (!selected) {
        await interaction.reply({ content: "❌ Aucun scheduler sélectionné.", flags: EPHEMERAL });
      } else {
        removeSchedule(interaction.guildId, selected.id);
        // sélection suivante
        const all = listSchedules(interaction.guildId);
        const next = all[0]?.id || null;
        setSession(interaction.user.id, interaction.guildId, next);
        selectedId = next;
        selected = selectedId ? getSchedule(interaction.guildId, selectedId) : null;

        await interaction.reply({ content: `🗑️ Scheduler supprimé.`, flags: EPHEMERAL });
      }
    }

    // refresh / rerender
    selected = selectedId ? getSchedule(interaction.guildId, selectedId) : null;
    const embed = buildManagerEmbed(interaction.guildId, selected);
    const menuRow = buildSelectMenu(interaction.guildId, selectedId);
    const buttonsRow = buildButtons(selected);

    await interaction.update({ embeds: [embed], components: [menuRow, buttonsRow] });
    return true;
  } catch (e) {
    console.error("[sched-ui] error:", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Erreur Scheduler Manager.", flags: EPHEMERAL });
    }
    return true;
  }
}

module.exports = { openScheduleManager, handleScheduleUIInteraction };
