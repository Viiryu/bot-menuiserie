/**
 * deploy-commands-all.js
 * Déploie TOUTES les commandes (core compta + part2).
 *
 * Env requis dans .env :
 * - DISCORD_TOKEN
 * - CLIENT_ID
 * - GUILD_ID
 */

require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ Variables manquantes. Vérifie .env : DISCORD_TOKEN, CLIENT_ID, GUILD_ID");
  process.exit(1);
}

/* ===================== 1) COMMANDES CORE (COMPTA) ===================== */
const comptaCommands = [
  new SlashCommandBuilder()
    .setName("syncsalaires")
    .setDescription("Sync salaires (1 semaine)")
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("salairesstatus")
    .setDescription("Statut salaires (1 semaine)")
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Marquer un employé PAYÉ (1 semaine)")
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .addStringOption((o) =>
      o.setName("employe").setDescription("Nom exact dans Historique salaires").setRequired(true).setAutocomplete(true)
    )
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("unpay")
    .setDescription("Marquer un employé PAS PAYÉ (1 semaine)")
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .addStringOption((o) =>
      o.setName("employe").setDescription("Nom exact dans Historique salaires").setRequired(true).setAutocomplete(true)
    )
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("payuser")
    .setDescription("PAYÉ via user Discord (BOT_LINKS)")
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .addUserOption((o) => o.setName("user").setDescription("Utilisateur Discord lié").setRequired(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("unpayuser")
    .setDescription("PAS PAYÉ via user Discord (BOT_LINKS)")
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .addUserOption((o) => o.setName("user").setDescription("Utilisateur Discord lié").setRequired(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Verrouiller une semaine (salaires)")
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Déverrouiller une semaine (salaires)")
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("synccommandes")
    .setDescription("Sync commandes (1 semaine)")
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("commandesstatus")
    .setDescription("Statut commandes (1 semaine)")
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("syncrachatemploye")
    .setDescription("Sync rachat employé (1 semaine)")
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("syncrachattemp")
    .setDescription("Sync rachat temporaire (1 semaine)")
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("syncall")
    .setDescription("Sync ALL (1 semaine)")
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("publish")
    .setDescription("Publier / MAJ un résumé")
    .addStringOption((o) =>
      o
        .setName("type")
        .setDescription("Type de résumé")
        .setRequired(true)
        .addChoices({ name: "Rachat employé", value: "rachat_employe" }, { name: "Rachat temporaire", value: "rachat_temporaire" })
    )
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Lier un employé Sheets à un user Discord")
    .addUserOption((o) => o.setName("user").setDescription("User Discord").setRequired(true))
    .addStringOption((o) => o.setName("nom").setDescription("Nom employé (Sheets)").setRequired(true))
    .addStringOption((o) => o.setName("telegramme").setDescription("LGW-xxxx (optionnel)").setRequired(false))
    .addBooleanOption((o) => o.setName("active").setDescription("Actif ? (défaut: true)").setRequired(false))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("unlink")
    .setDescription("Désactiver le lien BOT_LINKS d’un user Discord")
    .addUserOption((o) => o.setName("user").setDescription("User Discord").setRequired(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("dellink")
    .setDescription("Supprimer la ligne BOT_LINKS d’un user Discord")
    .addUserOption((o) => o.setName("user").setDescription("User Discord").setRequired(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("rebuildall")
    .setDescription("REBUILD ALL (purge + reposte) pour 1 semaine")
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("rebuildsalaires")
    .setDescription("REBUILD salaires (purge + reposte) pour 1 semaine")
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("rebuildcommandes")
    .setDescription("REBUILD commandes (purge + reposte) pour 1 semaine")
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("rebuildrachatemploye")
    .setDescription("REBUILD rachat employé (purge + reposte) pour 1 semaine")
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("rebuildrachattemp")
    .setDescription("REBUILD rachat temporaire (purge + reposte) pour 1 semaine")
    .addStringOption((o) => o.setName("semaine").setDescription("Ex: 2025-S49").setRequired(true).setAutocomplete(true))
    .setDMPermission(false),
];

/* ===================== 2) COMMANDES PART2 (auto-load) ===================== */
function loadPart2Commands() {
  let COMMANDS = [];
  try {
    ({ COMMANDS } = require("./part2/commands"));
  } catch (e) {
    console.error("⚠️ Impossible de charger ./part2/commands (index.js).", e?.message || e);
    return [];
  }

  const out = [];
  for (const cmd of COMMANDS) {
    if (cmd?.data?.toJSON) out.push(cmd.data.toJSON());
    else if (cmd?.toJSON) out.push(cmd.toJSON());
    else if (cmd?.builder?.toJSON) out.push(cmd.builder.toJSON());
  }
  return out;
}

function dedupeByName(commandJsonList) {
  const map = new Map();
  for (const c of commandJsonList) {
    if (!c?.name) continue;
    map.set(c.name, c); // last wins
  }
  return [...map.values()];
}

const part2Commands = loadPart2Commands();
const commands = dedupeByName([...comptaCommands.map((c) => c.toJSON()), ...part2Commands]);

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log(`🚀 Déploiement de ${commands.length} commandes sur le serveur ${GUILD_ID}...`);
    console.log("📦 Noms:", commands.map((c) => `/${c.name}`).join(", "));

    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });

    console.log("✅ Déploiement terminé !");
    console.log("ℹ️ Astuce: ferme/ré-ouvre Discord ou Ctrl+R pour rafraîchir la liste des slash commands.");
  } catch (error) {
    console.error("❌ Erreur déploiement:", error);
    process.exit(1);
  }
})();
