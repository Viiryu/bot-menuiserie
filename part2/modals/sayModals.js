const { IDS } = require("../constants");
const { safeAllowedMentions } = require("../util");
const { isStaff } = require("../permissions");

async function handleSayModal(interaction) {
  if (!interaction.isModalSubmit()) return false;

  try {
    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: MessageFlags.Ephemeral
 });
      return true;
    }

    // ===== SAY TEXT =====
    if (interaction.customId === IDS.SAY_TEXT_MODAL) {
      const content = interaction.fields.getTextInputValue("content");
      const pingRaw = interaction.fields.getTextInputValue("ping") || "";

      const ids = pingRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const mentionText = ids.map((id) => `<@${id}>`).join(" ");

      await interaction.channel.send({
        content: `${mentionText ? mentionText + "\n" : ""}${content}`,
        allowedMentions: safeAllowedMentions({
          allowUsers: true,
          allowRoles: true,
          allowEveryone: false,
        }),
      });

      await interaction.reply({ content: "✅ Message envoyé.", flags: MessageFlags.Ephemeral
 });
      return true;
    }

    return false;
  } catch (e) {
    console.error("[part2] say text modal error:", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Erreur lors de l’envoi du message.",
        flags: MessageFlags.Ephemeral
,
      });
    }
    return true;
  }
}

module.exports = { handleSayModal };
