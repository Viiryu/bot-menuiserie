/**
 * clear-global-commands.js
 * 
 * Supprime TOUTES les slash commands globales (celles qui mettent ~1h à disparaître).
 * Utile si tu as des doubles commandes (ex: /staffpanel + /staff panel).
 * 
 * Pré-requis: .env doit contenir DISCORD_TOKEN et CLIENT_ID (Application ID)
 * 
 * Run:
 *   node tools/clear-global-commands.js
 */
require('dotenv').config();

const { REST, Routes } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token) {
  console.error('❌ DISCORD_TOKEN manquant dans .env');
  process.exit(1);
}
if (!clientId) {
  console.error('❌ CLIENT_ID manquant dans .env (Application ID du bot)');
  console.error('➡️ Dev Portal > ton application > General Information > Application ID');
  process.exit(1);
}

(async () => {
  const rest = new REST({ version: '10' }).setToken(token);
  try {
    console.log('🧹 Suppression des commandes GLOBAL…');
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    console.log('✅ OK. Les commandes globales vont disparaître (parfois en quelques minutes).');
  } catch (e) {
    console.error('❌ Erreur clear global:', e?.rawError || e?.message || e);
    process.exit(1);
  }
})();
