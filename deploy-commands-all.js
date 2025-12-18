require("dotenv").config();

const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ DISCORD_TOKEN / CLIENT_ID / GUILD_ID manquants dans .env");
  process.exit(1);
}

/**
 * IMPORTANT :
 * Discord ne “rajoute” pas des commandes.
 * Quand on déploie, on envoie la LISTE COMPLETE.
 * Donc on met ici COMPTA + PART2.
 */

// =====================
// 1) COMMANDES COMPTA (copie de ton deploy-commands.js)
// =====================
const comptaCommands = [
  // ===== Links =====
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Lie un utilisateur Discord à un employé (BOT_LINKS).")
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName("user").setDescription("Utilisateur Discord à lier").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("nom")
        .setDescription(
          "Nom employé (doit correspondre à 'Prénom et nom' dans Historique salaires)"
        )
        .setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("telegramme").setDescription("Télégramme (optionnel)").setRequired(false)
    )
    .addBooleanOption((o) =>
      o.setName("active").setDescription("Activer le lien ? (par défaut: true)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("unlink")
    .setDescription("Désactive le lien BOT_LINKS pour un utilisateur Discord.")
    .setDMPermission(false)
    .addUserOption((o) => o.setName("user").setDescription("Utilisateur Discord").setRequired(true)),

  new SlashCommandBuilder()
    .setName("dellink")
    .setDescription("Supprime la ligne BOT_LINKS pour un utilisateur Discord (suppression réelle).")
    .setDMPermission(false)
    .addUserOption((o) => o.setName("user").setDescription("Utilisateur Discord").setRequired(true)),

  // ===== Salaires =====
  new SlashCommandBuilder()
    .setName("syncsalaires")
    .setDescription("Synchronise les embeds Salaires d'une semaine (résumé + unitaires).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Ex: 2025-S50").setAutocomplete(true).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("salairesstatus")
    .setDescription("Affiche un résumé (payé/pas payé/total) pour une semaine.")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Ex: 2025-S50").setAutocomplete(true).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Passe un employé en 'Payé' (Sheets + update embed).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Semaine").setAutocomplete(true).setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("employe")
        .setDescription("Employé (autocomplete basé sur la semaine)")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unpay")
    .setDescription("Passe un employé en 'Pas payé' (Sheets + update embed).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Semaine").setAutocomplete(true).setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("employe")
        .setDescription("Employé (autocomplete basé sur la semaine)")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("payuser")
    .setDescription("Passe en 'Payé' via un utilisateur Discord lié (BOT_LINKS).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Semaine").setAutocomplete(true).setRequired(true)
    )
    .addUserOption((o) => o.setName("user").setDescription("Utilisateur Discord lié à l'employé").setRequired(true)),

  new SlashCommandBuilder()
    .setName("unpayuser")
    .setDescription("Passe en 'Pas payé' via un utilisateur Discord lié (BOT_LINKS).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Semaine").setAutocomplete(true).setRequired(true)
    )
    .addUserOption((o) => o.setName("user").setDescription("Utilisateur Discord lié à l'employé").setRequired(true)),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Verrouille une semaine (empêche toute modif salaires).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Semaine").setAutocomplete(true).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Déverrouille une semaine.")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Semaine").setAutocomplete(true).setRequired(true)
    ),

  // ===== Commandes =====
  new SlashCommandBuilder()
    .setName("synccommandes")
    .setDescription("Synchronise les embeds Commandes d'une semaine (résumé + unitaires).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Semaine").setAutocomplete(true).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("commandesstatus")
    .setDescription("Résumé Commandes d'une semaine (nb + total + breakdown statut si dispo).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Semaine").setAutocomplete(true).setRequired(true)
    ),

  // ===== Rachat employé =====
  new SlashCommandBuilder()
    .setName("syncrachatemploye")
    .setDescription("Synchronise les embeds Rachat employé d'une semaine (résumé + unitaires).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Semaine").setAutocomplete(true).setRequired(true)
    ),

  // ===== Rachat temporaire =====
  new SlashCommandBuilder()
    .setName("syncrachattemp")
    .setDescription("Synchronise les embeds Rachat temporaire d'une semaine (résumé + unitaires).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Semaine").setAutocomplete(true).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("syncrachatemporaire")
    .setDescription("Alias de /syncrachattemp (Rachat temporaire).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Semaine").setAutocomplete(true).setRequired(true)
    ),

  // ===== Sync All =====
  new SlashCommandBuilder()
    .setName("syncall")
    .setDescription("Synchronise les 4 historiques d'une semaine (salaires+commandes+rachats).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Semaine").setAutocomplete(true).setRequired(true)
    ),

  // ===== Publish =====
  new SlashCommandBuilder()
    .setName("publish")
    .setDescription("Publie (ou met à jour) un résumé de semaine pour rachat employé ou temporaire.")
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName("type")
        .setDescription("Type de publication")
        .setRequired(true)
        .addChoices(
          { name: "Rachat employé", value: "rachat_employe" },
          { name: "Rachat temporaire", value: "rachat_temporaire" }
        )
    )
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Semaine").setAutocomplete(true).setRequired(true)
    ),

  // ===== Rebuild =====
  new SlashCommandBuilder()
    .setName("rebuildsalaires")
    .setDescription("Supprime + reposte Salaires d'une semaine (résumé puis unitaires).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Semaine").setAutocomplete(true).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("rebuildcommandes")
    .setDescription("Supprime + reposte Commandes d'une semaine (résumé puis unitaires).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Semaine").setAutocomplete(true).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("rebuildrachatemploye")
    .setDescription("Supprime + reposte Rachat employé d'une semaine (résumé puis unitaires).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Semaine").setAutocomplete(true).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("rebuildrachattemp")
    .setDescription("Supprime + reposte Rachat temporaire d'une semaine (résumé puis unitaires).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Semaine").setAutocomplete(true).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("rebuildall")
    .setDescription("Rebuild les 4 historiques d'une semaine (résumés en premier).")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("semaine").setDescription("Semaine").setAutocomplete(true).setRequired(true)
    ),
];

// =====================
// 2) COMMANDES PART2 (on ajoute ici)
// =====================
const part2Commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Afficher l’aide du bot (Part2)")
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Supprimer un nombre de messages (optionnel: d’un user)")
    .setDMPermission(false)
    .addIntegerOption((o) => o.setName("amount").setDescription("1 à 100").setRequired(true))
    .addUserOption((o) => o.setName("user").setDescription("Cible (optionnel)").setRequired(false)),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban un membre (+ supprimer 0-7 jours de messages)")
    .setDMPermission(false)
    .addUserOption((o) => o.setName("user").setDescription("Utilisateur").setRequired(true))
    .addIntegerOption((o) => o.setName("days").setDescription("0 à 7 jours").setRequired(false))
    .addStringOption((o) => o.setName("reason").setDescription("Raison").setRequired(false)),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Envoyer un message (texte ou embed)")
    .setDMPermission(false)
    .addSubcommand((s) => s.setName("text").setDescription("Message classique"))
    .addSubcommand((s) => s.setName("embed").setDescription("Message embed stylé")),

  // ✅ Scheduler V1 (RAM)
  new SlashCommandBuilder()
  .setName("schedule")
  .setDescription("Messages récurrents (premium sans Postgres)")
  .setDMPermission(false)

  .addSubcommand((s) =>
    s
      .setName("create")
      .setDescription("Créer un message récurrent")
      .addStringOption((o) =>
        o.setName("type").setDescription("Type").setRequired(true)
          .addChoices({ name: "text", value: "text" }, { name: "embed", value: "embed" })
      )
      .addIntegerOption((o) => o.setName("every_minutes").setDescription("Répéter toutes les X minutes").setRequired(true).setMinValue(1))
      .addChannelOption((o) => o.setName("channel").setDescription("Salon cible (défaut: salon actuel)").setRequired(false))
      .addIntegerOption((o) => o.setName("start_in_minutes").setDescription("Démarrer dans X minutes").setRequired(false).setMinValue(0))
      .addStringOption((o) => o.setName("ping").setDescription("Mentions/ping optionnel").setRequired(false))
  )

  .addSubcommand((s) => s.setName("list").setDescription("Lister les schedulers"))

  .addSubcommand((s) =>
    s.setName("test").setDescription("Envoie une fois maintenant")
      .addIntegerOption((o) => o.setName("id").setDescription("ID").setRequired(true).setMinValue(1))
  )

  .addSubcommand((s) =>
    s.setName("pause").setDescription("Pause un scheduler")
      .addIntegerOption((o) => o.setName("id").setDescription("ID").setRequired(true).setMinValue(1))
  )

  .addSubcommand((s) =>
    s.setName("resume").setDescription("Reprend un scheduler")
      .addIntegerOption((o) => o.setName("id").setDescription("ID").setRequired(true).setMinValue(1))
  )

  .addSubcommand((s) =>
    s.setName("edit").setDescription("Modifier salon/intervalle/ping")
      .addIntegerOption((o) => o.setName("id").setDescription("ID").setRequired(true).setMinValue(1))
      .addIntegerOption((o) => o.setName("every_minutes").setDescription("Nouvel intervalle (minutes)").setRequired(false).setMinValue(1))
      .addChannelOption((o) => o.setName("channel").setDescription("Nouveau salon").setRequired(false))
      .addStringOption((o) => o.setName("ping").setDescription("Nouveau ping").setRequired(false))
  )

  .addSubcommand((s) =>
    s.setName("run_now").setDescription("Force une exécution maintenant")
      .addIntegerOption((o) => o.setName("id").setDescription("ID").setRequired(true).setMinValue(1))
  )

  .addSubcommand((s) =>
    s.setName("stop").setDescription("Supprime un scheduler")
      .addIntegerOption((o) => o.setName("id").setDescription("ID").setRequired(true).setMinValue(1))
  ),
];

// IMPORTANT: la liste finale = COMPTA + PART2
const commands = [...comptaCommands, ...part2Commands].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("📦 Déploiement des commandes (COMPTA + PART2)...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log(`✅ Commandes déployées en GUILD (instant) : ${GUILD_ID}`);
  } catch (error) {
    console.error("❌ Erreur déploiement commandes:", error);
    process.exit(1);
  }
})();
