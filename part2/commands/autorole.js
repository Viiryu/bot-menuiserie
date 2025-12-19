const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlagsBitField,
} = require("discord.js");

const { isStaff } = require("../permissions");
const { addAutoroleMenu, listAutoroleMenus, removeAutoroleMenu } = require("../autorole/autoroleState");
const { AUTOROLE_CUSTOM_ID } = require("../autorole/autoroleComponents");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

function pickRoles(interaction) {
  const roles = [];
  for (let i = 1; i <= 10; i++) {
    const r = interaction.options.getRole(`role${i}`);
    if (r) roles.push(r);
  }
  // unique
  const seen = new Set();
  return roles.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Créer un menu d’auto-rôles (select)")
    .addSubcommand((s) =>
      s
        .setName("create")
        .setDescription("Créer un menu d’auto-rôles")
        .addChannelOption((o) => o.setName("channel").setDescription("Salon cible").setRequired(false))
        .addStringOption((o) => o.setName("title").setDescription("Titre").setRequired(true))
        .addStringOption((o) => o.setName("description").setDescription("Description").setRequired(false))
        .addBooleanOption((o) => o.setName("multi").setDescription("Multi-sélection ?").setRequired(false))
        .addRoleOption((o) => o.setName("role1").setDescription("Rôle 1").setRequired(true))
        .addRoleOption((o) => o.setName("role2").setDescription("Rôle 2").setRequired(false))
        .addRoleOption((o) => o.setName("role3").setDescription("Rôle 3").setRequired(false))
        .addRoleOption((o) => o.setName("role4").setDescription("Rôle 4").setRequired(false))
        .addRoleOption((o) => o.setName("role5").setDescription("Rôle 5").setRequired(false))
        .addRoleOption((o) => o.setName("role6").setDescription("Rôle 6").setRequired(false))
        .addRoleOption((o) => o.setName("role7").setDescription("Rôle 7").setRequired(false))
        .addRoleOption((o) => o.setName("role8").setDescription("Rôle 8").setRequired(false))
        .addRoleOption((o) => o.setName("role9").setDescription("Rôle 9").setRequired(false))
        .addRoleOption((o) => o.setName("role10").setDescription("Rôle 10").setRequired(false))
    )
    .addSubcommand((s) => s.setName("list").setDescription("Lister les menus"))
    .addSubcommand((s) =>
      s
        .setName("delete")
        .setDescription("Supprimer un menu (par messageId)")
        .addStringOption((o) => o.setName("message_id").setDescription("ID du message").setRequired(true))
    ),

  async execute(interaction) {
    try {
      if (!(await isStaff(interaction.member))) {
        await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
        return;
      }

      const sub = interaction.options.getSubcommand();

      if (sub === "list") {
        const items = listAutoroleMenus(interaction.guildId);
        const lines = items.length
          ? items.map((m) => `• <#${m.channelId}> — message \`${m.messageId}\` — rôles: ${m.roleIds.length}`).join("\n")
          : "—";
        await interaction.reply({ content: `📌 Menus auto-rôles:\n${lines}`, flags: EPHEMERAL });
        return;
      }

      if (sub === "delete") {
        const messageId = interaction.options.getString("message_id");
        const removed = removeAutoroleMenu(messageId);
        await interaction.reply({
          content: removed ? `🗑️ Menu supprimé (store): \`${messageId}\`` : `⚠️ Aucun menu trouvé: \`${messageId}\``,
          flags: EPHEMERAL,
        });
        return;
      }

      // create
      const channel = interaction.options.getChannel("channel") || interaction.channel;
      const title = interaction.options.getString("title");
      const description = interaction.options.getString("description") || "";
      const multi = interaction.options.getBoolean("multi") === true;

      if (!channel?.isTextBased?.()) {
        await interaction.reply({ content: "❌ Salon invalide.", flags: EPHEMERAL });
        return;
      }

      const roles = pickRoles(interaction);
      if (!roles.length) {
        await interaction.reply({ content: "❌ Ajoute au moins 1 rôle.", flags: EPHEMERAL });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🎭 ${title}`)
        .setDescription(
          [
            description,
            "",
            "✅ Sélectionne un rôle dans le menu ci-dessous.",
            "🔁 Si tu l’as déjà, ça l’enlève (toggle).",
          ].filter(Boolean).join("\n")
        )
        .setFooter({ text: "Auto-rôles — Le Secrétaire" })
        .setTimestamp(new Date());

      const select = new StringSelectMenuBuilder()
        .setCustomId(AUTOROLE_CUSTOM_ID)
        .setPlaceholder("Choisir un rôle…")
        .setMinValues(1)
        .setMaxValues(multi ? Math.min(roles.length, 10) : 1)
        .addOptions(
          roles.slice(0, 25).map((r) => ({
            label: r.name.slice(0, 100),
            value: r.id,
          }))
        );

      const row = new ActionRowBuilder().addComponents(select);

      const msg = await channel.send({ embeds: [embed], components: [row] });

      addAutoroleMenu({
        guildId: interaction.guildId,
        channelId: channel.id,
        messageId: msg.id,
        roleIds: roles.map((r) => r.id),
        multi,
        createdAt: Date.now(),
      });

      await interaction.reply({
        content: `✅ Menu auto-rôles publié dans <#${channel.id}>.\nID: \`${msg.id}\``,
        flags: EPHEMERAL,
      });
    } catch (e) {
      console.error("autorole.execute error:", e);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "❌ Erreur interne /autorole.", flags: EPHEMERAL }).catch(() => {});
      }
    }
  },
};
