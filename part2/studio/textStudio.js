const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlagsBitField,
} = require("discord.js");

const { IDS } = require("../constants");
const { isStaff } = require("../permissions");
const { ensureDraft, getDraft, setDraftMeta, updateDraft, clearDraft } = require("./studioState");
const { addSchedule } = require("../scheduler/schedulerState");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

const _req = ["TEXTSTUDIO_EDIT","TEXTSTUDIO_PREVIEW","TEXTSTUDIO_SCHEDULE","TEXTSTUDIO_CANCEL","TEXTSTUDIO_MODAL"];
for (const k of _req) {
  if (!IDS || typeof IDS[k] !== "string") throw new Error(`[TextStudio] IDS.${k} manquant dans part2/constants.js`);
}

function panelText(d) {
  const content = (d.text?.content || "").trim();
  const sched = d.meta?.schedule;
  const everyMin = sched ? Math.round((sched.everyMs || 0) / 60000) : "?";
  const startMin = sched ? Math.round((sched.startDelayMs || 0) / 60000) : 0;

  return [
    "**Text Studio** (brouillon temporaire en mémoire)",
    `• Longueur: **${content.length}/2000**`,
    `• Salon: ${sched?.channelId ? `<#${sched.channelId}>` : "?"}`,
    `• Toutes les: **${everyMin} min**`,
    `• Démarre dans: **${startMin} min**`,
    `• Ping: ${sched?.ping ? `\`${sched.ping}\`` : "—"}`,
    "",
    "**Contenu :**",
    content ? content.slice(0, 1500) : "_(vide)_",
  ].join("\n");
}

function rows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(IDS.TEXTSTUDIO_EDIT).setLabel("✏️ Modifier").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(IDS.TEXTSTUDIO_PREVIEW).setLabel("👁️ Preview").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(IDS.TEXTSTUDIO_SCHEDULE).setLabel("🗓️ Planifier").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(IDS.TEXTSTUDIO_CANCEL).setLabel("✖ Annuler").setStyle(ButtonStyle.Danger)
    ),
  ];
}

async function openTextStudio(interaction, { schedule } = {}) {
  if (!(await isStaff(interaction.member))) {
    return interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
  }

  ensureDraft(interaction.user.id, interaction.channelId);

  setDraftMeta(interaction.user.id, {
    mode: "schedule_text",
    schedule: { ...schedule, type: "text" },
  });

  const d = getDraft(interaction.user.id);

  const embed = new EmbedBuilder()
    .setTitle("🗓️ Scheduler — Text Studio")
    .setDescription(panelText(d))
    .setTimestamp(new Date());

  return interaction.reply({ embeds: [embed], components: rows(), flags: EPHEMERAL });
}

async function handleTextStudioInteraction(interaction) {
  if (interaction.isButton() && String(interaction.customId).startsWith("p2:textstudio:")) {
    try {
      if (!(await isStaff(interaction.member))) {
        await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
        return true;
      }

      const d = getDraft(interaction.user.id);
      if (!d || d.channelId !== interaction.channelId || d.meta?.mode !== "schedule_text") {
        await interaction.reply({ content: "❌ Brouillon expiré. Refais `/schedule create type:text`.", flags: EPHEMERAL });
        return true;
      }

      const id = interaction.customId;

      if (id === IDS.TEXTSTUDIO_CANCEL) {
        clearDraft(interaction.user.id);
        await interaction.update({ content: "✅ Annulé.", embeds: [], components: [] });
        return true;
      }

      if (id === IDS.TEXTSTUDIO_EDIT) {
        const modal = new ModalBuilder().setCustomId(IDS.TEXTSTUDIO_MODAL).setTitle("✏️ Modifier le message");

        const content = new TextInputBuilder()
          .setCustomId("content")
          .setLabel("Contenu (2000 max)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(2000)
          .setValue(d.text?.content || "");

        modal.addComponents(new ActionRowBuilder().addComponents(content));
        await interaction.showModal(modal);
        return true;
      }

      if (id === IDS.TEXTSTUDIO_PREVIEW) {
        const content = (d.text?.content || "").trim();
        await interaction.reply({
          content: content ? `👁️ Preview :\n\n${content}` : "👁️ Preview : _(vide)_",
          flags: EPHEMERAL,
        });
        return true;
      }

      if (id === IDS.TEXTSTUDIO_SCHEDULE) {
        const content = (d.text?.content || "").trim();
        if (!content) {
          await interaction.reply({ content: "❌ Ton message est vide.", flags: EPHEMERAL });
          return true;
        }

        const cfg = d.meta?.schedule;
        if (!cfg?.guildId || !cfg?.channelId || !cfg?.everyMs) {
          await interaction.reply({ content: "❌ Config scheduler manquante. Refais `/schedule create`.", flags: EPHEMERAL });
          return true;
        }

        const sched = addSchedule({
          guildId: cfg.guildId,
          channelId: cfg.channelId,
          type: "text",
          everyMs: cfg.everyMs,
          payload: { content },
          createdBy: interaction.user.id,
          startDelayMs: cfg.startDelayMs || 0,
          ping: cfg.ping || "",
        });

        clearDraft(interaction.user.id);
        await interaction.update({
          content: `✅ Scheduler créé (**#${sched.id}**) — toutes les **${Math.round(sched.everyMs / 60000)} min** dans <#${sched.channelId}>`,
          embeds: [],
          components: [],
        });
        return true;
      }

      return true;
    } catch (e) {
      console.error("[part2] textstudio button error:", e);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "❌ Erreur Text Studio.", flags: EPHEMERAL });
      }
      return true;
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === IDS.TEXTSTUDIO_MODAL) {
    try {
      if (!(await isStaff(interaction.member))) {
        await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
        return true;
      }

      const d = getDraft(interaction.user.id);
      if (!d || d.channelId !== interaction.channelId || d.meta?.mode !== "schedule_text") {
        await interaction.reply({ content: "❌ Brouillon expiré. Refais `/schedule create type:text`.", flags: EPHEMERAL });
        return true;
      }

      const content = interaction.fields.getTextInputValue("content") || "";

      updateDraft(interaction.user.id, (dd) => {
        dd.text = dd.text || { content: "" };
        dd.text.content = content;
      });

      const updated = getDraft(interaction.user.id);

      const embed = new EmbedBuilder()
        .setTitle("🗓️ Scheduler — Text Studio")
        .setDescription(panelText(updated))
        .setTimestamp(new Date());

      await interaction.reply({ content: "✅ Modifié.", embeds: [embed], components: rows(), flags: EPHEMERAL });
      return true;
    } catch (e) {
      console.error("[part2] textstudio modal error:", e);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "❌ Erreur Text Studio.", flags: EPHEMERAL });
      }
      return true;
    }
  }

  return false;
}

module.exports = { openTextStudio, handleTextStudioInteraction };
