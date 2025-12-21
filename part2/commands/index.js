// part2/commands/index.js
// ✅ Export standard attendu : { COMMANDS, findCommand }
// + Compat: { listCommands, getCommand, loadCommands }

const help = require('./help');
const purge = require('./purge');
const ban = require('./ban');
const unban = require('./unban');
const say = require('./say');
const schedule = require('./schedule');
const autorole = require('./autorole');
const staff = require('./staff');

const RAW = [help, purge, ban, unban, say, schedule, autorole, staff];

function getCmdName(c) {
  return c?.data?.name || c?.name || c?.builder?.name || null;
}

const seen = new Set();
const COMMANDS = RAW.filter((c) => {
  const n = getCmdName(c);
  if (!n) return false;
  if (seen.has(n)) return false;
  // Empêche les vieux legacy (ex: staffpanel) si jamais un fichier traîne
  if (n === 'staffpanel') return false;
  seen.add(n);
  return true;
});

function findCommand(name) {
  return COMMANDS.find((c) => getCmdName(c) === name) || null;
}

function listCommands() {
  return COMMANDS;
}
function getCommand(name) {
  return findCommand(name);
}
function loadCommands() {
  return COMMANDS;
}

module.exports = { COMMANDS, findCommand, listCommands, getCommand, loadCommands };
