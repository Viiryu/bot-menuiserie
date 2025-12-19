// part2/commands/index.js
const help = require("./help");
const purge = require("./purge");
const ban = require("./ban");
const say = require("./say");
const schedule = require("./schedule");
const autorole = require("./autorole");

const COMMANDS = [help, purge, ban, say, schedule, autorole];

/**
 * Retourne le nom canonical de la commande :
 * - préférences: data.name (SlashCommandBuilder)
 * - fallback: name
 */
function getCmdName(c) {
  return c?.data?.name || c?.name || null;
}

function findCommand(name) {
  const n = String(name || "").toLowerCase();
  return COMMANDS.find((c) => String(getCmdName(c) || "").toLowerCase() === n);
}

module.exports = { COMMANDS, findCommand };
