// part2/commands/say.js
const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlagsBitField,
} = require("discord.js");

const { SAY_IDS } = require("../say/ids");
const { isStaff } = require("../permissions");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

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

module.exports = {
  data: new SlashCommandBuilder()
    .setName(SAY_IDS.CMD_SAY)
    .setDescription("Publie un message texte ou un embed (Studio intégré premium).")
    .addSubcommand((s) =>
      s.setName("text").setDescription("Créer un message texte (Studio intégré).")
    )
    .addSubcommand((s) =>
      s.setName("embed").setDescription("Créer un embed (Studio intégré).")
    ),

  async execute(interaction) {
    try {
      if (!(await isStaff(interaction.member))) {
        await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
        return;
      }

      const sub = interaction.options.getSubcommand();

      if (sub === "text") {
        await interaction.showModal(buildTextModal());
        return;
      }

      if (sub === "embed") {
        await interaction.showModal(buildEmbedBasicModal());
        return;
      }

      await interaction.reply({ content: "❌ Sous-commande inconnue.", flags: EPHEMERAL });
    } catch (e) {
      console.error("say.execute error:", e);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "❌ Erreur interne /say.", flags: EPHEMERAL }).catch(() => {});
      }
    }
  },
};