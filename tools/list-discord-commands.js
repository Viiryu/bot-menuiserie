// tools/list-discord-commands.js
// Liste GLOBAL vs GUILD commands pour détecter les doubles (/staffpanel vs /staff panel etc.)
//
// Usage (PowerShell):
//   $env:DISCORD_TOKEN="..."; $env:CLIENT_ID="..."; $env:GUILD_ID="..."; node tools/list-discord-commands.js
//
// NB: nécessite discord.js installé.

require("dotenv").config();
const { REST, Routes } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token) throw new Error("DISCORD_TOKEN manquant dans .env");
if (!clientId) throw new Error("CLIENT_ID manquant dans .env (Application ID)");
if (!guildId) throw new Error("GUILD_ID manquant dans .env");

const rest = new REST({ version: "10" }).setToken(token);

function fmt(list) {
  return list.map((c) => `/${c.name}${c.description ? "" : ""}`).sort();
}

(async () => {
  const global = await rest.get(Routes.applicationCommands(clientId));
  const guild = await rest.get(Routes.applicationGuildCommands(clientId, guildId));

  const globalNames = fmt(global);
  const guildNames = fmt(guild);

  console.log(`🌍 GLOBAL (${globalNames.length}) : ${globalNames.join(", ") || "—"}`);
  console.log(`🏠 GUILD  (${guildNames.length}) : ${guildNames.join(", ") || "—"}`);

  const dupes = globalNames.filter((n) => guildNames.includes(n));
  console.log(`🧯 Doublons (présents dans les 2) (${dupes.length}) : ${dupes.join(", ") || "—"}`);

  const globalOnly = globalNames.filter((n) => !guildNames.includes(n));
  const guildOnly = guildNames.filter((n) => !globalNames.includes(n));
  console.log(`➕ Global uniquement (${globalOnly.length}) : ${globalOnly.join(", ") || "—"}`);
  console.log(`➕ Guild uniquement  (${guildOnly.length}) : ${guildOnly.join(", ") || "—"}`);
})();
