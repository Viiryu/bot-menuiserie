// part2/commands/staff.js
const { SlashCommandBuilder, MessageFlagsBitField } = require("discord.js");
const { isStaff } = require("../permissions");
const { loadStaffConfig, getGuildConfig } = require("../staff/staffConfigState");
const { buildHomeEmbed, buildHomeComponents } = require("../staff/staffUI");
const { buildLogsPayload } = require("../staff/staffComponents");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("staff")
    .setDescription("Hub staff centralisé (panel premium)")
    .addSubcommand((s) => s.setName("panel").setDescription("Ouvrir le panel staff"))
    .addSubcommand((s) => s.setName("config").setDescription("Configurer salons logs + options"))
    .addSubcommand((s) => s.setName("logs").setDescription("Afficher les derniers logs"))
    .addSubcommand((s) => s.setName("diag").setDescription("Diagnostic permissions du bot"))
    .addSubcommand((s) => s.setName("maintenance").setDescription("Afficher état maintenance"))
    .setDMPermission(false),

  async run(interaction) {
    return this.execute(interaction);
  },

  async execute(interaction) {
    try {
      if (!(await isStaff(interaction.member))) {
        await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
        return;
      }

      loadStaffConfig();
      const cfg = getGuildConfig(interaction.guildId);

      const sub = interaction.options.getSubcommand();

      if (sub === "logs") {
        await interaction.reply({ ...buildLogsPayload(interaction.guildId, "all"), flags: EPHEMERAL });
        return;
      }

      if (sub === "maintenance") {
        await interaction.reply({
          content: cfg.maintenance ? "🧯 Maintenance: ✅ ON" : "🧯 Maintenance: ❌ OFF",
          flags: EPHEMERAL,
        });
        return;
      }

      if (sub === "diag") {
        const guild = interaction.guild;
        const me = await guild.members.fetchMe().catch(() => null);
        const perms = me?.permissions;

        const lines = [
          `ManageRoles: ${perms?.has?.("ManageRoles") ? "✅" : "❌"}`,
          `ModerateMembers: ${perms?.has?.("ModerateMembers") ? "✅" : "❌"}`,
          `KickMembers: ${perms?.has?.("KickMembers") ? "✅" : "❌"}`,
          `BanMembers: ${perms?.has?.("BanMembers") ? "✅" : "❌"}`,
          `ManageMessages: ${perms?.has?.("ManageMessages") ? "✅" : "❌"}`,
        ];

        await interaction.reply({
          embeds: [
            {
              title: "🧪 Diagnostic — Permissions du bot",
              color: 0xCBA135,
              description: lines.join("\n"),
              footer: { text: "Diag — Le Secrétaire" },
              timestamp: new Date().toISOString(),
            },
          ],
          flags: EPHEMERAL,
        });
        return;
      }

      // config/panel -> même écran (config accessible via bouton)
      await interaction.reply({ embeds: [buildHomeEmbed(interaction.guild, cfg)], components: buildHomeComponents(), flags: EPHEMERAL });
    } catch (e) {
      console.error("staff.execute error:", e);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "❌ Erreur interne /staff.", flags: EPHEMERAL }).catch(() => {});
      }
    }
  },
};
