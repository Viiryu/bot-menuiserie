/**
 * Clear GLOBAL application commands.
 *
 * Why: if you previously deployed slash commands globally, they can coexist with
 * your new GUILD commands => duplicates like /staffpanel + /staff panel.
 *
 * Usage:
 *   set DISCORD_TOKEN=... 
 *   set DISCORD_CLIENT_ID=...
 *   node scripts/clear-global-commands.js
 */

require('dotenv').config();
const { REST, Routes } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  console.error('❌ Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in .env');
  process.exit(1);
}

(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    console.log('✅ Global commands cleared. (Only guild commands will remain)');
  } catch (err) {
    console.error('❌ Failed to clear global commands:', err);
    process.exit(1);
  }
})();
