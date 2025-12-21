/**
 * tools/clear-global-commands.js
 * Supprime toutes les slash commands GLOBAL (utile si tu as un vieux /staffpanel global qui traîne).
 *
 * Usage:
 *   node tools/clear-global-commands.js
 *
 * Variables d'environnement attendues:
 *   DISCORD_TOKEN
 *   DISCORD_CLIENT_ID
 */

require('dotenv').config();
const { REST, Routes } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  console.error('❌ DISCORD_TOKEN ou DISCORD_CLIENT_ID manquant dans .env');
  process.exit(1);
}

(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    const current = await rest.get(Routes.applicationCommands(clientId));
    const names = Array.isArray(current) ? current.map((c) => `/${c.name}`) : [];

    console.log(`🌍 Global en place (${names.length}) : ${names.length ? names.join(', ') : '—'}`);
    console.log('🧹 Suppression des GLOBAL...');

    await rest.put(Routes.applicationCommands(clientId), { body: [] });

    console.log('✅ Global commands vidées.');
    console.log('ℹ️ Note: la disparition côté Discord peut prendre un peu de temps (cache client + propagation).');
  } catch (e) {
    console.error('❌ Clear global failed:', e);
    process.exit(1);
  }
})();
