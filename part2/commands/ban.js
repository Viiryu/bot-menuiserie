const { PermissionFlagsBits } = require("discord.js");
const { isStaff } = require("../permissions");

async function run(interaction) {
  const user = interaction.options.getUser("user", true);
  const days = interaction.options.getInteger("days") ?? 0;
  const reason = interaction.options.getString("reason") ?? "Aucune raison.";

  const can =
    interaction.memberPermissions.has(PermissionFlagsBits.BanMembers) ||
    (await isStaff(interaction.member));

  if (!can) return interaction.reply({ content: "❌ Tu n’as pas la permission pour /ban.", flags: MessageFlags.Ephemeral
 });

  const safeDays = Math.max(0, Math.min(days, 7));
  const deleteMessageSeconds = safeDays * 24 * 60 * 60;

  await interaction.guild.members.ban(user.id, { deleteMessageSeconds, reason });

  return interaction.reply({ content: `✅ <@${user.id}> banni. Messages supprimés : ${safeDays} jour(s).`, flags: MessageFlags.Ephemeral
 });
}

module.exports = { name: "ban", run };
