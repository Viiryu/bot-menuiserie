// part2/commands/index.js
// Loader robuste : charge toutes les commandes du dossier.

const fs = require('fs');
const path = require('path');

const COMMANDS = [];

function getNameFromData(data) {
  if (!data) return undefined;
  if (typeof data.name === 'string' && data.name.trim()) return data.name.trim();
  try {
    const json = data.toJSON?.();
    if (json?.name) return json.name;
  } catch {}
  return undefined;
}

function isValidCommand(mod) {
  if (!mod) return false;
  const data = mod.data;
  const name = getNameFromData(data);
  if (!name) return false;
  const hasExecute = typeof mod.execute === 'function' || typeof mod.run === 'function';
  return hasExecute;
}

function loadCommands() {
  COMMANDS.length = 0;
  const dir = __dirname;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js') && f !== 'index.js')
    .sort();

  for (const file of files) {
    const full = path.join(dir, file);
    // hot-reload safe
    delete require.cache[require.resolve(full)];

    let mod;
    try {
      mod = require(full);
    } catch (e) {
      console.error(`[part2/commands] ❌ ${file} require() failed:`, e);
      continue;
    }

    const name = getNameFromData(mod?.data);
    if (!isValidCommand(mod)) {
      // Logging explicite (comme tu l'aimes) — sans casser le déploiement
      if (!name) {
        console.error(`[part2/commands] ❌ ${file} missing data.name (string).`);
      } else if (!(typeof mod.execute === 'function' || typeof mod.run === 'function')) {
        console.error(`[part2/commands] ❌ ${file} missing execute(interaction) or run(interaction).`);
      } else {
        console.error(`[part2/commands] ❌ ${file} invalid export shape.`);
      }
      continue;
    }

    COMMANDS.push(mod);
  }

  return COMMANDS;
}

function listCommands() {
  return COMMANDS.map((c) => `/${getNameFromData(c.data)}`).filter(Boolean);
}

function getCommand(name) {
  if (!name) return null;
  const lower = String(name).toLowerCase();
  return COMMANDS.find((c) => getNameFromData(c.data)?.toLowerCase() === lower) || null;
}

function findCommand(name) {
  return getCommand(name);
}

// Auto-load au require
loadCommands();

module.exports = {
  COMMANDS,
  loadCommands,
  listCommands,
  getCommand,
  findCommand,
};
