const { SlashCommandBuilder, MessageFlagsBitField } = require("discord.js");
const { isStaff } = require("../permissions");
const { openStudio } = require("../studio/embedStudio");
const { openTextStudio } = require("../studio/textStudio");
const { openScheduleManager } = require("../scheduler/schedulerUI");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

const data = new SlashCommandBuilder()
  .setName("schedule")
  .setDescription("Messages récurrents (ultra premium)")
  .setDMPermission(false)

  .addSubcommand((s) =>
    s
      .setName("create")
      .setDescription("Créer un scheduler")
      .addStringOption((o) =>
        o
          .setName("type")
          .setDescription("Type")
          .setRequired(true)
          .addChoices({ name: "text", value: "text" }, { name: "embed", value: "embed" })
      )
      .addIntegerOption((o) =>
        o.setName("every_minutes").setDescription("Répéter toutes les X minutes").setRequired(true).setMinValue(1)
      )
      .addChannelOption((o) =>
        o.setName("channel").setDescription("Salon cible (défaut: salon actuel)").setRequired(false)
      )
      .addIntegerOption((o) =>
        o.setName("start_in_minutes").setDescription("Démarrer dans X minutes").setRequired(false).setMinValue(0)
      )
      .addStringOption((o) =>
        o.setName("ping").setDescription("Ping optionnel (@here ou <@&roleId>)").setRequired(false)
      )
  )

  .addSubcommand((s) => s.setName("list").setDescription("Ouvrir le Scheduler Manager"));

async function run(interaction) {
  if (!(await isStaff(interaction.member))) {
    return interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
  }

  const sub = interaction.options.getSubcommand(true);

  if (sub === "list") return openScheduleManager(interaction);

  // create
  const type = interaction.options.getString("type", true);
  const everyMinutes = interaction.options.getInteger("every_minutes", true);
  const startIn = interaction.options.getInteger("start_in_minutes") || 0;
  const ping = interaction.options.getString("ping") || "";

  const channel = interaction.options.getChannel("channel") || interaction.channel;
  const channelId = channel?.id || interaction.channelId;

  const schedule = {
    guildId: interaction.guildId,
    channelId,
    everyMs: everyMinutes * 60_000,
    startDelayMs: startIn * 60_000,
    ping,
  };

  if (type === "text") return openTextStudio(interaction, { schedule });
  return openStudio(interaction, { mode: "schedule", schedule });
}

module.exports = { name: "schedule", data, run };
