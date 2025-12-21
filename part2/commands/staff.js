/**
 * /staff panel
 * Publie le panel staff premium.
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { isStaff } = require("../permissions");
const { buildStaffPanelPayload } = require("../staff/staffPanel");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("staff")
    .setDescription("Outils staff (panel, config, etc.)")
    .addSubcommand((sc) =>
      sc
        .setName("panel")
        .setDescription("Publie le panel staff dans un salon")
        .addChannelOption((opt) =>
          opt.setName("salon").setDescription("Salon cible (par défaut: ici)").setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    const member = interaction.member;
    if (!(await Promise.resolve(isStaff(member)))) {
      return interaction.reply({ content: "⛔ Accès réservé au staff.", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    if (sub !== "panel") {
      return interaction.reply({ content: "Commande inconnue.", ephemeral: true });
    }

    const target = interaction.options.getChannel("salon") ?? interaction.channel;
    if (!target || !target.isTextBased?.()) {
      return interaction.reply({ content: "❌ Choisis un salon texte.", ephemeral: true });
    }

    const payload = await buildStaffPanelPayload(interaction.client, interaction.guild ?? interaction.guildId);
    const msg = await target.send(payload);

    return interaction.reply({
      content: `✅ Panel staff publié dans ${target}. (message: ${msg.url})`,
      ephemeral: true,
    });
  },
};
