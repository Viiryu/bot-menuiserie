const { PermissionFlagsBits } = require("discord.js");
const { isStaff } = require("../permissions");

async function run(interaction) {
  const amount = interaction.options.getInteger("amount", true);
  const user = interaction.options.getUser("user");
  const limit = Math.min(Math.max(amount, 1), 100);

  const can =
    interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages) ||
    (await isStaff(interaction.member));

  if (!can) return interaction.reply({ content: "❌ Tu n’as pas la permission pour /purge.", flags: MessageFlags.Ephemeral
 });

  const fetched = await interaction.channel.messages.fetch({ limit: 100 });

  let candidates = fetched;
  if (user) candidates = fetched.filter((m) => m.author?.id === user.id);

  const toDelete = candidates.first(limit);
  const deleted = await interaction.channel.bulkDelete(toDelete, true);

  return interaction.reply({ content: `✅ Supprimé : ${deleted.size} message(s).`, flags: MessageFlags.Ephemeral
 });
}

module.exports = { name: "purge", run };
