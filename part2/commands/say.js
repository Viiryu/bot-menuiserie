// part2/commands/say.js
const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlagsBitField,
  EmbedBuilder,
} = require("discord.js");

const { SAY_IDS } = require("../say/ids");
const { isStaff } = require("../permissions");

const { getSayDraft, setSayDraft } = require("../say/sayState");
const { buildStudioPreviewPayload } = require("../say/sayPreview");

const {
  safePresetName,
  listPresetNames,
  getPreset,
  savePreset,
  deletePreset,
  deserializeDraft,
} = require("../say/presetsStore");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

/* ===================== MODALS (inchangés) ===================== */
function buildTextModal() {
  const modal = new ModalBuilder()
    .setCustomId(SAY_IDS.MODAL_TEXT)
    .setTitle("Studio /say — Message texte");

  const content = new TextInputBuilder()
    .setCustomId("content")
    .setLabel("Message")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000)
    .setPlaceholder("Écris ton message ici…");

  modal.addComponents(new ActionRowBuilder().addComponents(content));
  return modal;
}

function buildEmbedBasicModal() {
  const modal = new ModalBuilder()
    .setCustomId(SAY_IDS.MODAL_EMBED_BASIC)
    .setTitle("Studio /say — Embed (Base)");

  const title = new TextInputBuilder()
    .setCustomId("title")
    .setLabel("Titre (optionnel)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(256);

  const description = new TextInputBuilder()
    .setCustomId("description")
    .setLabel("Description")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(4000);

  const color = new TextInputBuilder()
    .setCustomId("color")
    .setLabel("Couleur hex (optionnel) ex: #CBA135")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(16);

  const footerText = new TextInputBuilder()
    .setCustomId("footerText")
    .setLabel("Footer (optionnel)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(2048);

  const url = new TextInputBuilder()
    .setCustomId("url")
    .setLabel("URL (optionnel)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder().addComponents(title),
    new ActionRowBuilder().addComponents(description),
    new ActionRowBuilder().addComponents(color),
    new ActionRowBuilder().addComponents(footerText),
    new ActionRowBuilder().addComponents(url)
  );

  return modal;
}

/* ===================== SLASH BUILDER ===================== */
const data = new SlashCommandBuilder()
  .setName(SAY_IDS.CMD_SAY)
  .setDescription("Publie un message texte ou un embed (Studio intégré premium).")
  .addSubcommand((s) =>
    s.setName("text").setDescription("Créer un message texte (Studio intégré).")
  )
  .addSubcommand((s) =>
    s.setName("embed").setDescription("Créer un embed (Studio intégré).")
  )
  .addSubcommandGroup((g) =>
    g
      .setName("preset")
      .setDescription("Sauvegarder / charger tes modèles /say")
      .addSubcommand((s) =>
        s
          .setName("save")
          .setDescription("Sauvegarde le brouillon /say actuel comme preset")
          .addStringOption((o) =>
            o
              .setName("nom")
              .setDescription("Nom (a-z A-Z 0-9 _ -) max 32")
              .setRequired(true)
          )
      )
      .addSubcommand((s) =>
        s
          .setName("use")
          .setDescription("Charge un preset en brouillon et affiche la preview")
          .addStringOption((o) =>
            o.setName("nom").setDescription("Nom du preset").setRequired(true)
          )
      )
      .addSubcommand((s) => s.setName("list").setDescription("Liste les presets"))
      .addSubcommand((s) =>
        s
          .setName("delete")
          .setDescription("Supprime un preset")
          .addStringOption((o) =>
            o.setName("nom").setDescription("Nom du preset").setRequired(true)
          )
      )
  );

/* ===================== HANDLER ===================== */
async function execute(interaction) {
  try {
    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return;
    }

    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    // === /say text ===
    if (!group && sub === "text") {
      await interaction.showModal(buildTextModal());
      return;
    }

    // === /say embed ===
    if (!group && sub === "embed") {
      await interaction.showModal(buildEmbedBasicModal());
      return;
    }

    // === /say preset ... ===
    if (group === "preset") {
      // SAVE
      if (sub === "save") {
        const nom = interaction.options.getString("nom", true);
        const safe = safePresetName(nom);
        if (!safe) {
          return interaction.reply({
            content: "❌ Nom invalide. Utilise uniquement a-z A-Z 0-9 `_` `-` (max 32).",
            flags: EPHEMERAL,
          });
        }

        const draft = getSayDraft(interaction.guildId, interaction.user.id);
        if (!draft) {
          return interaction.reply({
            content: "❌ Aucun brouillon actif. Lance `/say text` ou `/say embed` d’abord.",
            flags: EPHEMERAL,
          });
        }

        const res = savePreset(interaction.guildId, safe, draft);
        if (!res.ok) {
          const msg =
            res.reason === "limit"
              ? "❌ Limite atteinte (25 presets). Supprime-en un."
              : "❌ Impossible de sauvegarder ce brouillon.";
          return interaction.reply({ content: msg, flags: EPHEMERAL });
        }

        return interaction.reply({ content: `✅ Preset sauvegardé : **${safe}**`, flags: EPHEMERAL });
      }

      // USE
      if (sub === "use") {
        const nom = interaction.options.getString("nom", true);
        const safe = safePresetName(nom);
        if (!safe) return interaction.reply({ content: "❌ Nom invalide.", flags: EPHEMERAL });

        const preset = getPreset(interaction.guildId, safe);
        if (!preset) {
          return interaction.reply({ content: `❌ Preset introuvable : **${safe}**`, flags: EPHEMERAL });
        }

        const draft = deserializeDraft(preset.payload, {
          guildId: interaction.guildId,
          ownerId: interaction.user.id,
          fallbackChannelId: interaction.channelId,
        });

        if (!draft) {
          return interaction.reply({ content: "❌ Preset corrompu (draft invalide).", flags: EPHEMERAL });
        }

        setSayDraft(interaction.guildId, interaction.user.id, draft);

        const payload = buildStudioPreviewPayload(draft, `Preset chargé : **${safe}**`);
        return interaction.reply({ ...payload, flags: EPHEMERAL });
      }

      // LIST
      if (sub === "list") {
        const names = listPresetNames(interaction.guildId);
        const e = new EmbedBuilder()
          .setTitle("📚 Presets /say")
          .setDescription(names.length ? names.map((n) => `• \`${n}\``).join("\n") : "Aucun preset.")
          .setFooter({ text: "Utilise /say preset use nom:<x>" })
          .setTimestamp(new Date());

        return interaction.reply({ embeds: [e], flags: EPHEMERAL });
      }

      // DELETE
      if (sub === "delete") {
        const nom = interaction.options.getString("nom", true);
        const safe = safePresetName(nom);
        if (!safe) return interaction.reply({ content: "❌ Nom invalide.", flags: EPHEMERAL });

        const res = deletePreset(interaction.guildId, safe);
        if (!res.ok) {
          return interaction.reply({ content: `❌ Preset introuvable : **${safe}**`, flags: EPHEMERAL });
        }

        return interaction.reply({ content: `🗑️ Preset supprimé : **${safe}**`, flags: EPHEMERAL });
      }
    }

    await interaction.reply({ content: "❌ Sous-commande inconnue.", flags: EPHEMERAL });
  } catch (e) {
    console.error("say.execute error:", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Erreur interne /say.", flags: EPHEMERAL }).catch(() => {});
    }
  }
}

module.exports = {
  data,
  execute, // compat si ton loader appelle execute
  run: execute, // compat si ton part2/index.js appelle run()
};
