// deploy-commands.js
require("dotenv").config();

const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // Application ID du bot
const GUILD_ID = process.env.GUILD_ID;   // serveur (guild) pour déploiement instantané

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ DISCORD_TOKEN / CLIENT_ID / GUILD_ID manquants dans .env");
  process.exit(1);
}

const commands = [
  // ===== Links =====
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Lie un utilisateur Discord à un employé (BOT_LINKS).")
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName("user")
        .setDescription("Utilisateur Discord à lier")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("nom")
        .setDescription("Nom employé (doit correspondre à 'Prénom et nom' dans Historique salaires)")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("telegramme")
        .setDescription("Télégramme (optionnel)")
        .setRequired(false)
    )
    .addBooleanOption((o) =>
      o.setName("active")
        .setDescription("Activer le lien ? (par défaut: true)")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("unlink")
    .setDescription("Désactive le lien BOT_LINKS pour un utilisateur Discord.")
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName("user")
        .setDescription("Utilisateur Discord")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("dellink")
    .setDescription("Supprime la ligne BOT_LINKS pour un utilisateur Discord (suppression réelle).")
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName("user")
        .setDescription("Utilisateur Discord")
        .setRequired(true)
    ),

  // ===== Salaires =====
  new SlashCommandBuilder()
    .setName("syncsalaires")
    .setDescription("Synchronise les embeds Salaires d'une semaine (résumé + unitaires).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Ex: 2025-S50")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("salairesstatus")
    .setDescription("Affiche un résumé (payé/pas payé/total) pour une semaine.")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Ex: 2025-S50")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Passe un employé en 'Payé' (Sheets + update embed).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Semaine")
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("employe")
        .setDescription("Employé (autocomplete basé sur la semaine)")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unpay")
    .setDescription("Passe un employé en 'Pas payé' (Sheets + update embed).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Semaine")
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("employe")
        .setDescription("Employé (autocomplete basé sur la semaine)")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("payuser")
    .setDescription("Passe en 'Payé' via un utilisateur Discord lié (BOT_LINKS).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Semaine")
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addUserOption((o) =>
      o.setName("user")
        .setDescription("Utilisateur Discord lié à l'employé")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unpayuser")
    .setDescription("Passe en 'Pas payé' via un utilisateur Discord lié (BOT_LINKS).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Semaine")
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addUserOption((o) =>
      o.setName("user")
        .setDescription("Utilisateur Discord lié à l'employé")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Verrouille une semaine (empêche toute modif salaires).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Semaine")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Déverrouille une semaine.")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Semaine")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  // ===== Commandes =====
  new SlashCommandBuilder()
    .setName("synccommandes")
    .setDescription("Synchronise les embeds Commandes d'une semaine (résumé + unitaires).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Semaine")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("commandesstatus")
    .setDescription("Résumé Commandes d'une semaine (nb + total + breakdown statut si dispo).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Semaine")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  // ===== Rachat employé =====
  new SlashCommandBuilder()
    .setName("syncrachatemploye")
    .setDescription("Synchronise les embeds Rachat employé d'une semaine (résumé + unitaires).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Semaine")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  // ===== Rachat temporaire (2 noms: temp + temporaire) =====
  new SlashCommandBuilder()
    .setName("syncrachattemp")
    .setDescription("Synchronise les embeds Rachat temporaire d'une semaine (résumé + unitaires).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Semaine")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("syncrachatemporaire")
    .setDescription("Alias de /syncrachattemp (Rachat temporaire).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Semaine")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  // ===== Sync All =====
  new SlashCommandBuilder()
    .setName("syncall")
    .setDescription("Synchronise les 4 historiques d'une semaine (salaires+commandes+rachats).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Semaine")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  // ===== Publish (résumé) =====
  new SlashCommandBuilder()
    .setName("publish")
    .setDescription("Publie (ou met à jour) un résumé de semaine pour rachat employé ou temporaire.")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("type")
        .setDescription("Type de publication")
        .setRequired(true)
        .addChoices(
          { name: "Rachat employé", value: "rachat_employe" },
          { name: "Rachat temporaire", value: "rachat_temporaire" }
        )
    )
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Semaine")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  // ===== Rebuild =====
  new SlashCommandBuilder()
    .setName("rebuildsalaires")
    .setDescription("Supprime + reposte Salaires d'une semaine (résumé puis unitaires).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Semaine")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("rebuildcommandes")
    .setDescription("Supprime + reposte Commandes d'une semaine (résumé puis unitaires).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Semaine")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("rebuildrachatemploye")
    .setDescription("Supprime + reposte Rachat employé d'une semaine (résumé puis unitaires).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Semaine")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("rebuildrachattemp")
    .setDescription("Supprime + reposte Rachat temporaire d'une semaine (résumé puis unitaires).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Semaine")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("rebuildall")
    .setDescription("Rebuild les 4 historiques d'une semaine (résumés en premier).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine")
        .setDescription("Semaine")
        .setAutocomplete(true)
        .setRequired(true)
    ),
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("📦 Déploiement des commandes...");
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log(`✅ Commandes déployées en GUILD (instant) : ${GUILD_ID}`);
  } catch (error) {
    console.error("❌ Erreur déploiement commandes:", error);
    process.exit(1);
  }
})();
