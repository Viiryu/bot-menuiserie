require("dotenv").config();

const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.DISCORD_TOKEN;

if (!clientId || !guildId || !token) {
  console.error("❌ CLIENT_ID, GUILD_ID ou DISCORD_TOKEN manquant dans .env");
  process.exit(1);
}

// ---------------- Helpers options ----------------
const weekOption = (o) =>
  o
    .setName("semaine")
    .setDescription("Choisis une semaine (autocomplete)")
    .setRequired(true)
    .setAutocomplete(true);

const employeOption = (o) =>
  o
    .setName("employe")
    .setDescription("Choisis un employé (autocomplete)")
    .setRequired(true)
    .setAutocomplete(true);

const scanOption = (o) =>
  o
    .setName("scan")
    .setDescription("Combien de messages à scanner (défaut 300)")
    .setRequired(false);

// ---------------- Commands ----------------
const commands = [
  // ===================== SALAIRES =====================
  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Verrouille une semaine (salaires)")
    .addStringOption(weekOption),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Déverrouille une semaine (salaires)")
    .addStringOption(weekOption),

  new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Met un employé en Payé (salaires)")
    .addStringOption(weekOption)
    .addStringOption(employeOption),

  new SlashCommandBuilder()
    .setName("unpay")
    .setDescription("Met un employé en Pas payé (salaires)")
    .addStringOption(weekOption)
    .addStringOption(employeOption),

  new SlashCommandBuilder()
    .setName("payuser")
    .setDescription("Met un employé en Payé via mention @user (BOT_LINKS)")
    .addStringOption(weekOption)
    .addUserOption((o) =>
      o.setName("user").setDescription("Utilisateur Discord").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unpayuser")
    .setDescription("Met un employé en Pas payé via mention @user (BOT_LINKS)")
    .addStringOption(weekOption)
    .addUserOption((o) =>
      o.setName("user").setDescription("Utilisateur Discord").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("salairesstatus")
    .setDescription("Résumé salaires d’une semaine (payés, total, lock, etc.)")
    .addStringOption(weekOption),

  // (optionnel, déjà gérés dans certains bot.js : si tu ne les veux pas tu peux les supprimer)
  new SlashCommandBuilder()
    .setName("syncsalaires")
    .setDescription("Sync salaires d’une semaine (si géré par bot.js)")
    .addStringOption(weekOption),

  new SlashCommandBuilder()
    .setName("publishsalaires")
    .setDescription("Publish salaires d’une semaine (si géré par bot.js)")
    .addStringOption(weekOption),

  new SlashCommandBuilder()
    .setName("purgesalaires")
    .setDescription("Supprime les doublons d’embeds salaires d’une semaine")
    .addStringOption(weekOption)
    .addIntegerOption(scanOption),

  // ===================== HISTORIQUE COMMANDES =====================
  new SlashCommandBuilder()
    .setName("synccommandes")
    .setDescription("Force la sync Discord des commandes pour une semaine")
    .addStringOption(weekOption),

  new SlashCommandBuilder()
    .setName("publishcommandes")
    .setDescription("Publie/Met à jour les commandes pour une semaine (create/edit)")
    .addStringOption(weekOption),

  new SlashCommandBuilder()
    .setName("commandesstatus")
    .setDescription("Résumé commandes d’une semaine (nb lignes)")
    .addStringOption(weekOption),

  new SlashCommandBuilder()
    .setName("purgecommandes")
    .setDescription("Supprime les doublons d’embeds commandes pour une semaine")
    .addStringOption(weekOption)
    .addIntegerOption(scanOption),

  new SlashCommandBuilder()
    .setName("synccommandesall")
    .setDescription("Force la sync Discord des commandes pour toutes les semaines"),

  // ===================== RACHAT EMPLOYÉ =====================
  new SlashCommandBuilder()
    .setName("syncrachatemploye")
    .setDescription("Sync rachat employé pour une semaine")
    .addStringOption(weekOption),

  new SlashCommandBuilder()
    .setName("publishrachatemploye")
    .setDescription("Publie/Met à jour rachat employé pour une semaine")
    .addStringOption(weekOption),

  new SlashCommandBuilder()
    .setName("rachatemployestatus")
    .setDescription("Résumé rachat employé d’une semaine (nb lignes)")
    .addStringOption(weekOption),

  new SlashCommandBuilder()
    .setName("purgerachatemploye")
    .setDescription("Supprime les doublons rachat employé d’une semaine")
    .addStringOption(weekOption)
    .addIntegerOption(scanOption),

  new SlashCommandBuilder()
    .setName("syncrachatemployeall")
    .setDescription("Sync rachat employé pour toutes les semaines"),

  // ===================== RACHAT TEMPORAIRE =====================
  new SlashCommandBuilder()
    .setName("syncrachattemp")
    .setDescription("Sync rachat temporaire pour une semaine")
    .addStringOption(weekOption),

  new SlashCommandBuilder()
    .setName("publishrachattemp")
    .setDescription("Publie/Met à jour rachat temporaire pour une semaine")
    .addStringOption(weekOption),

  new SlashCommandBuilder()
    .setName("rachattempstatus")
    .setDescription("Résumé rachat temporaire d’une semaine (nb lignes)")
    .addStringOption(weekOption),

  new SlashCommandBuilder()
    .setName("purgerachattemp")
    .setDescription("Supprime les doublons rachat temporaire d’une semaine")
    .addStringOption(weekOption)
    .addIntegerOption(scanOption),

  new SlashCommandBuilder()
    .setName("syncrachattempall")
    .setDescription("Sync rachat temporaire pour toutes les semaines"),

  // ===================== BOT_LINKS =====================
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Admin: lier un compte Discord à un employé (BOT_LINKS)")
    .addUserOption((o) =>
      o.setName("user").setDescription("Utilisateur Discord").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("nom").setDescription("Nom employé exact").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("telegramme").setDescription("Télégramme").setRequired(false)
    )
    .addBooleanOption((o) =>
      o.setName("active").setDescription("Actif ? (défaut true)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("unlink")
    .setDescription("Admin: désactiver le lien (active=false) dans BOT_LINKS")
    .addUserOption((o) =>
      o.setName("user").setDescription("Utilisateur Discord").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("dellink")
    .setDescription("Admin: supprimer la ligne BOT_LINKS d’un utilisateur")
    .addUserOption((o) =>
      o.setName("user").setDescription("Utilisateur Discord").setRequired(true)
    ),
].map((c) => c.toJSON());

// ---------------- Deploy ----------------
const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("⏳ Déploiement des slash commands...");
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log("✅ Slash commands déployées sur le serveur.");
  } catch (err) {
    console.error("❌ Erreur deploy commands:", err);
  }
})();