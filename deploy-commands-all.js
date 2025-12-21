/**
 * deploy-commands-all.js — LGW (Core compta + Part2)
 *
 * ✅ Déploie les slash commands sur un GUILD (instant)
 * ✅ Affiche les commandes actuellement en place + diff + résultat final
 * ✅ Protège contre un déploiement "vide" (qui wipe tout) : si Total=0 -> STOP
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

function uniqByName(cmdJsonList) {
  const map = new Map();
  for (const c of cmdJsonList) {
    if (!c?.name) continue;
    map.set(c.name, c); // last wins
  }
  return [...map.values()];
}

function safeNameOf(cmd) {
  return cmd?.data?.name || cmd?.name || cmd?.builder?.name || null;
}

function toJson(cmd) {
  if (!cmd) return null;
  if (cmd?.data?.toJSON) return cmd.data.toJSON();
  if (cmd?.toJSON) return cmd.toJSON();
  if (cmd?.builder?.toJSON) return cmd.builder.toJSON();
  return null;
}

function fmtList(names) {
  return names.length ? names.map((n) => `/${n}`).join(", ") : "—";
}

/* ===================== 1) COMMANDES CORE (COMPTA) ===================== */
function buildCoreComptaCommands() {
  const out = [
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
          .addChoices(
            { name: "Rachat employé", value: "rachat_employe" },
            { name: "Rachat temporaire", value: "rachat_temporaire" }
          )
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

  return out.map((b) => b.toJSON());
}

/* ===================== 2) COMMANDES PART2 (robuste) ===================== */
function loadPart2CommandsJson() {
  let mod = null;
  try {
    mod = require("./part2/commands");
  } catch (e) {
    console.error("❌ Part2: impossible de require('./part2/commands'):", e?.message || e);
    return [];
  }

  // Plusieurs styles d'exports possibles selon tes packs
  // - { COMMANDS: [...] }
  // - { loadCommands(), listCommands(), getCommand(), ... } (COMMANDS peut être rempli après loadCommands)
  let cmds = mod.COMMANDS;

  if (!Array.isArray(cmds) && typeof mod.loadCommands === "function") {
    try {
      mod.loadCommands(); // peut peupler mod.COMMANDS
      cmds = mod.COMMANDS;
    } catch (e) {
      console.error("❌ Part2: loadCommands() a échoué:", e?.message || e);
    }
  }

  if (!Array.isArray(cmds) && typeof mod.listCommands === "function") {
    // listCommands peut renvoyer des objets commandes ou juste des noms.
    try {
      const listed = mod.listCommands();
      if (Array.isArray(listed)) cmds = listed;
    } catch (e) {
      console.error("❌ Part2: listCommands() a échoué:", e?.message || e);
    }
  }

  if (!Array.isArray(cmds)) {
    console.error(`❌ Part2: ./part2/commands ne renvoie pas COMMANDS[] (Array). Keys:`, Object.keys(mod || {}));
    return [];
  }

  const json = [];
  for (const cmd of cmds) {
    const name = safeNameOf(cmd);
    const j = toJson(cmd);
    if (!name || typeof name !== "string") {
      console.error(`[part2/commands] ❌ ${String(cmd?.file || name || "unknown")} missing data.name (string).`);
      continue;
    }
    if (!j?.name) {
      console.error(`[part2/commands] ❌ ${name} toJSON() invalide.`);
      continue;
    }
    json.push(j);
  }
  return json;
}

async function getCurrentGuildCommandNames(rest) {
  try {
    const cur = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID));
    if (!Array.isArray(cur)) return [];
    return cur.map((c) => c?.name).filter(Boolean).sort();
  } catch (e) {
    console.error("⚠️ Impossible de lire les commandes actuelles:", e?.message || e);
    return [];
  }
}

function diffNames(before, after) {
  const b = new Set(before);
  const a = new Set(after);
  const added = [...a].filter((x) => !b.has(x)).sort();
  const removed = [...b].filter((x) => !a.has(x)).sort();
  return { added, removed };
}

(async () => {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  console.log("📦 Déploiement des commandes...");

  const core = buildCoreComptaCommands();
  const part2 = loadPart2CommandsJson();

  const commands = uniqByName([...core, ...part2]);

  console.log(`🧩 Core: ${core.length} | Part2: ${part2.length} | Total: ${commands.length}`);

  // 🔒 Sécurité anti-wipe
  if (commands.length === 0) {
    console.error("⛔ STOP: Total=0. Je refuse de déployer pour éviter de SUPPRIMER toutes tes slash commands.");
    console.error("➡️ Fix d'abord le chargement (core/part2), puis relance.");
    process.exit(1);
  }

  const before = await getCurrentGuildCommandNames(rest);
  console.log(`📌 Actuellement en place (${before.length}) : ${fmtList(before)}`);

  const toDeployNames = commands.map((c) => c.name).filter(Boolean).sort();
  console.log(`🚀 À déployer (${toDeployNames.length}) : ${fmtList(toDeployNames)}`);

  const { added, removed } = diffNames(before, toDeployNames);
  console.log(`🧾 Changements: +${added.length} / -${removed.length}`);
  if (added.length) console.log("   ➕ Ajoutées:", fmtList(added));
  if (removed.length) console.log("   ➖ Retirées:", fmtList(removed));

  // DRY_RUN optionnel
  if (String(process.env.DRY_RUN || "").toLowerCase() === "true") {
    console.log("🧪 DRY_RUN=true -> aucun déploiement effectué.");
    process.exit(0);
  }

  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });

  console.log(`✅ Commandes déployées en GUILD (instant) : ${GUILD_ID}`);

  const after = await getCurrentGuildCommandNames(rest);
  console.log(`🎯 Résultat final (${after.length}) : ${fmtList(after)}`);

  console.log("ℹ️ Astuce: ferme/ré-ouvre Discord ou Ctrl+R pour rafraîchir la liste des slash commands.");
})().catch((err) => {
  console.error("❌ Erreur déploiement:", err?.stack || err?.message || err);
  process.exit(1);
});
