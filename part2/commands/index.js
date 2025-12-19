// part2/commands/index.js
const help = require("./help");
const purge = require("./purge");
const ban = require("./ban");
const say = require("./say");
const schedule = require("./schedule");
const autorole = require("./autorole");
const staff = require("./staff");

const COMMANDS = [help, purge, ban, say, schedule, autorole, staff];

function getCmdName(c) {
  return c?.data?.name || c?.name || c?.builder?.name || null;
}

function findCommand(name) {
  return COMMANDS.find((c) => getCmdName(c) === name) || null;
}

module.exports = { COMMANDS, findCommand };
