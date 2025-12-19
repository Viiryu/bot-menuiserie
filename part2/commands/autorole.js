// part2/commands/autorole.js
const { SlashCommandBuilder, MessageFlagsBitField } = require("discord.js");
const { isStaff } = require("../permissions");

const {
  loadAutorolesFromDisk,
  listAutoroleMessages,
  removeAutoroleMessage,
  setPending,
} = require("../autorole/autoroleState");

const { buildWizardPayload } = require("../autorole/autoroleUI");

const EPHEMERAL = MessageFlagsBitField.Flags.Ephemeral;

function defaultDraft(guildId, userId) {
  return {
    guildId,
    userId,

    // target
    channelId: null,
    roleIds: [],

    // behavior
    mode: "toggle", // toggle | add
    multi: true, // public menu max values > 1
    remplacement: false, // si true: enlève les autres rôles autorisés non sélectionnés
    temporary: false, // si true: le rôle expire
    durationMs: 60 * 60 * 1000, // 1h par défaut

    // style
    title: "🎭 Autoroles",
    description: "Sélectionne un rôle dans le menu ci-dessous.",
    placeholder: "Choisir un rôle…",
    color: "#CBA135",
    footer: "Auto-rôles — Le Secrétaire",

    meta: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  };
}

async function executeAutorole(interaction) {
  try {
    if (!(await isStaff(interaction.member))) {
      await interaction.reply({ content: "❌ Réservé au staff.", flags: EPHEMERAL });
      return;
    }

    loadAutorolesFromDisk();

    const sub = interaction.options.getSubcommand();

    if (sub === "list") {
      const items = listAutoroleMessages(interaction.guildId);

      const lines = items.length
        ? items
            .map((x) => {
              const m = x.mode === "add" ? "➕ add" : "🔁 toggle";
              const multi = x.multi ? "multi" : "mono";
              const repl = x.remplacement ? "remplacement" : "pas-remplacement";
              const tmp = x.temporary ? `⏳ ${Math.round((x.durationMs || 0) / 60000)}m` : "♾️ définitif";
              return `• <#${x.channelId}> — \`${x.messageId}\` — rôles:${x.roleIds?.length || 0} — ${m} — ${multi} — ${repl} — ${tmp}`;
            })
            .join("\n")
        : "—";

      await interaction.reply({ content: `📌 Menus autorole (store):\n${lines}`, flags: EPHEMERAL });
      return;
    }

    if (sub === "delete") {
      const messageId = interaction.options.getString("message_id", true);
      const removed = removeAutoroleMessage(interaction.guildId, messageId);

      await interaction.reply({
        content: removed ? `🗑️ Menu supprimé (store) : \`${messageId}\`` : `⚠️ Aucun menu trouvé : \`${messageId}\``,
        flags: EPHEMERAL,
      });
      return;
    }

    // create -> wizard
    const draft = defaultDraft(interaction.guildId, interaction.user.id);
    setPending(interaction.guildId, interaction.user.id, draft);

    const payload = buildWizardPayload(draft, "Wizard prêt. Configure puis **Publier**.");
    await interaction.reply({ ...payload, flags: EPHEMERAL });
  } catch (e) {
    console.error("[autorole] execute error:", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Erreur interne /autorole.", flags: EPHEMERAL }).catch(() => {});
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Créer un menu d’auto-rôles (Wizard premium)")
    .addSubcommand((s) => s.setName("create").setDescription("Ouvrir le wizard (menus + modals)"))
    .addSubcommand((s) => s.setName("list").setDescription("Lister les menus autorole actifs (store)"))
    .addSubcommand((s) =>
      s
        .setName("delete")
        .setDescription("Supprimer un menu autorole (store) via messageId")
        .addStringOption((o) => o.setName("message_id").setDescription("ID du message").setRequired(true))
    )
    .setDMPermission(false),

  // ✅ IMPORTANT: pas de "this.execute" (sinon crash car fn() perd le this)
  run: executeAutorole,
  execute: executeAutorole,
};
