/**
 * part2/modules/suggestions.js
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const { SUGGEST_IDS } = require("./ids");
const { getGuildConfig } = require("../config/configStore");

async function resolveTextChannel(client, channelId) {
  if (!channelId) return null;
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch?.isTextBased?.()) return ch;
  } catch {}
  return null;
}

function buildSuggestionPanel() {
  const embed = new EmbedBuilder()
    .setTitle("💡 Suggestions")
    .setDescription("Clique pour proposer une idée / amélioration.")
    .setTimestamp(new Date());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(SUGGEST_IDS.PANEL_OPEN)
      .setLabel("Proposer une suggestion")
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

async function publishSuggestionPanel(interaction, channelId) {
  const ch = channelId
    ? await resolveTextChannel(interaction.client, channelId)
    : interaction.channel;
  if (!ch?.isTextBased?.()) throw new Error("Salon invalide.");
  return ch.send(buildSuggestionPanel());
}

function buildSuggestionModal() {
  const modal = new ModalBuilder()
    .setCustomId(SUGGEST_IDS.MODAL)
    .setTitle("Nouvelle suggestion")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Titre")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("body")
          .setLabel("Détails")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1500)
      )
    );
  return modal;
}

async function handleSuggestionInteraction(interaction) {
  if (interaction.isButton() && interaction.customId === SUGGEST_IDS.PANEL_OPEN) {
    await interaction.showModal(buildSuggestionModal());
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId === SUGGEST_IDS.MODAL) {
    await interaction.deferReply({ ephemeral: true });

    const title = interaction.fields.getTextInputValue("title");
    const body = interaction.fields.getTextInputValue("body");

    const embed = new EmbedBuilder()
      .setTitle(`💡 ${title}`)
      .setDescription(body)
      .setFooter({ text: `Par ${interaction.user.tag} • ${interaction.user.id}` })
      .setTimestamp(new Date());

    const cfg = getGuildConfig(interaction.guildId);
    const ch =
      (await resolveTextChannel(interaction.client, cfg.suggestionsChannelId)) ||
      interaction.channel;

    const msg = await ch.send({ embeds: [embed] });

    // votes
    msg.react("👍").catch(() => {});
    msg.react("👎").catch(() => {});

    await interaction.editReply(`✅ Suggestion postée ! (Message: ${msg.url})`);
    return true;
  }

  return false;
}

module.exports = { publishSuggestionPanel, handleSuggestionInteraction };
