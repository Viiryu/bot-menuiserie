/**
 * clear-global-commands.js
 * Supprime TOUTES les commandes GLOBAL de l'application (pour enlever les doublons style /staffpanel).
 * ⚠️ Ne touche pas aux commandes GUILD (serveur).
 *
 * .env requis:
 * - DISCORD_TOKEN
 * - CLIENT_ID
 */
require("dotenv").config();
const { REST, Routes } = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error("❌ Variables manquantes. Vérifie .env : DISCORD_TOKEN, CLIENT_ID");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("🧹 Suppression des commandes GLOBAL...");
    // body: [] => supprime toutes les globales
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
    console.log("✅ Commandes GLOBAL supprimées.");
    console.log("ℹ️ Ensuite: redeploie tes commandes serveur avec node deploy-commands-all.js");
  } catch (e) {
    console.error("❌ Erreur clear global:", e);
    process.exit(1);
  }
})();
