const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");

const { IDS } = require("../constants");
const { isStaff } = require("../permissions");

const data = new SlashCommandBuilder()
  .setName("say")
  .setDescription("Envoyer un message (texte ou embed)")
  .setDMPermission(false)
  .addSubcommand((s) => s.setName("text").setDescription("Message classique"))
  .addSubcommand((s) => s.setName("embed").setDescription("Ouvrir l’Embed Studio (Draftbot-like)"));

async function run(interaction) {
  if (!(await isStaff(interaction.member))) {
    return interaction.reply({ content: "❌ Réservé au staff.", flags: MessageFlags.Ephemeral
 });
  }

  const sub = interaction.options.getSubcommand(true);

  // ======================
  // /say text => modal texte
  // ======================
  if (sub === "text") {
    const modal = new ModalBuilder()
      .setCustomId(IDS.SAY_TEXT_MODAL)
      .setTitle("📢 Say — Message");

    const content = new TextInputBuilder()
      .setCustomId("content")
      .setLabel("Message")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(2000);

    const ping = new TextInputBuilder()
      .setCustomId("ping")
      .setLabel("Mentions (optionnel) : userId/roleId, ex: 123,456")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(200);

    modal.addComponents(
      new ActionRowBuilder().addComponents(content),
      new ActionRowBuilder().addComponents(ping)
    );

    return interaction.showModal(modal);
  }

  // ======================
  // /say embed => ouvre Embed Studio
  // ======================
  const { openStudio } = require("../studio/embedStudio");
  return openStudio(interaction);
}

module.exports = { name: "say", data, run };
