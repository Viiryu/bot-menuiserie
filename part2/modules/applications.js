/**
 * part2/modules/applications.js
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

const { APPLICATION_IDS } = require("./ids");
const { getGuildConfig } = require("../config/configStore");
const { isStaff } = require("../permissions");

async function resolveTextChannel(client, channelId) {
  if (!channelId) return null;
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch?.isTextBased?.()) return ch;
  } catch {}
  return null;
}

function buildApplicationPanel() {
  const embed = new EmbedBuilder()
    .setTitle("📨 Candidatures")
    .setDescription(
      [
        "Envie de rejoindre l'équipe ?",
        "Clique sur le bouton pour déposer ta candidature.",
      ].join("\n")
    )
    .setTimestamp(new Date());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(APPLICATION_IDS.PANEL_OPEN)
      .setLabel("Déposer une candidature")
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

async function publishApplicationPanel(interaction, channelId) {
  const ch = channelId
    ? await resolveTextChannel(interaction.client, channelId)
    : interaction.channel;
  if (!ch?.isTextBased?.()) throw new Error("Salon invalide.");
  return ch.send(buildApplicationPanel());
}

function buildApplicationModal() {
  const modal = new ModalBuilder()
    .setCustomId(APPLICATION_IDS.MODAL)
    .setTitle("Candidature")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("who")
          .setLabel("Présente-toi (RP/HRP)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(800)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("why")
          .setLabel("Pourquoi nous rejoindre ?")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(800)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("avail")
          .setLabel("Disponibilités")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(120)
      )
    );
  return modal;
}

function buildReviewEmbed(user, values) {
  return new EmbedBuilder()
    .setTitle("📝 Nouvelle candidature")
    .setDescription(`👤 <@${user.id}> (\`${user.id}\`)`)
    .addFields(
      { name: "Présentation", value: values.who || "-" },
      { name: "Motivation", value: values.why || "-" },
      { name: "Disponibilités", value: values.avail || "-" }
    )
    .setTimestamp(new Date());
}

function buildReviewButtons(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(APPLICATION_IDS.BTN_APPROVE_PREFIX + userId)
      .setLabel("✅ Accepter")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(APPLICATION_IDS.BTN_REJECT_PREFIX + userId)
      .setLabel("❌ Refuser")
      .setStyle(ButtonStyle.Danger)
  );
}

async function handleApplicationInteraction(interaction) {
  if (interaction.isButton() && interaction.customId === APPLICATION_IDS.PANEL_OPEN) {
    await interaction.showModal(buildApplicationModal());
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId === APPLICATION_IDS.MODAL) {
    await interaction.deferReply({ ephemeral: true });

    const values = {
      who: interaction.fields.getTextInputValue("who"),
      why: interaction.fields.getTextInputValue("why"),
      avail: interaction.fields.getTextInputValue("avail"),
    };

    const cfg = getGuildConfig(interaction.guildId);
    const reviewCh =
      (await resolveTextChannel(interaction.client, cfg.applicationsChannelId)) ||
      interaction.channel;

    const msg = await reviewCh.send({
      embeds: [buildReviewEmbed(interaction.user, values)],
      components: [buildReviewButtons(interaction.user.id)],
    });

    await interaction.editReply(`✅ Candidature envoyée ! (Message: ${msg.url})`);
    return true;
  }

  if (interaction.isButton()) {
    const id = interaction.customId;
    const approve = id.startsWith(APPLICATION_IDS.BTN_APPROVE_PREFIX);
    const reject = id.startsWith(APPLICATION_IDS.BTN_REJECT_PREFIX);
    if (!approve && !reject) return false;

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!isStaff(member)) {
      await interaction.reply({ content: "⛔ Staff uniquement.", ephemeral: true });
      return true;
    }

    const userId = id.split(":").pop();
    const user = await interaction.client.users.fetch(userId).catch(() => null);

    const decision = approve ? "acceptée" : "refusée";

    await interaction.update({
      components: [],
    });

    if (user) {
      user
        .send(
          approve
            ? "✅ Ta candidature a été acceptée. Un staff va te contacter."
            : "❌ Ta candidature a été refusée. Merci d'avoir postulé."
        )
        .catch(() => {});
    }

    await interaction.followUp({
      content: `📌 Candidature **${decision}**.`,
      ephemeral: true,
    });

    return true;
  }

  return false;
}

module.exports = { publishApplicationPanel, handleApplicationInteraction };
