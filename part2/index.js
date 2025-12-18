// part2/index.js — routing Part2 (schedule + /say studio + modération/comm)
// NOTE: On garde Part2 léger : pas de /studio séparés (tout passe par /say).

const { startCacheGC } = require("./messageCache");
const { registerMessageLogs } = require("./events/messageLogs");
const { findCommand } = require("./commands");

const { startScheduler } = require("./scheduler/schedulerRunner");
const { handleScheduleModals } = require("./modals/scheduleModals");
const { handleScheduleUIInteraction } = require("./scheduler/schedulerUI");

// ✅ /say
const { handleSayModals } = require("./modals/sayModals");
const { handleSayComponents } = require("./components/sayComponents");

function registerPart2(client) {
  const { loadSchedulesFromDisk } = require("./scheduler/schedulerState");
  startCacheGC();
  loadSchedulesFromDisk();
  startScheduler(client);
  registerMessageLogs(client);
}

async function handlePart2Interaction(interaction) {
  // 1) /say (modals + components)
  if (await handleSayModals(interaction)) return true;
  if (await handleSayComponents(interaction)) return true;

  // 2) /schedule (UI + modals)
  if (await handleScheduleUIInteraction(interaction)) return true;
  if (await handleScheduleModals(interaction)) return true;

  // 3) Slash commands Part2
  if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
    const cmd = findCommand(interaction.commandName);
    if (!cmd) return false;
    await cmd.run(interaction);
    return true;
  }

  return false;
}

module.exports = { registerPart2, handlePart2Interaction };
