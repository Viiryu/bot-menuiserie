const help = require("./help");
const purge = require("./purge");
const ban = require("./ban");
const say = require("./say");
const schedule = require("./schedule");


const COMMANDS = [help, purge, ban, say, schedule];

function findCommand(name) {
  return COMMANDS.find((c) => c?.name === name);
}

module.exports = { COMMANDS, findCommand };
