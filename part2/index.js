const { startCacheGC } = require("./messageCache");
const { registerMessageLogs } = require("./events/messageLogs");
const { findCommand } = require("./commands");

const { handleSayModal } = require("./modals/sayModals");
const { handleEmbedStudioInteraction } = require("./studio/embedStudio");

const { startScheduler } = require("./scheduler/schedulerRunner");
const { handleScheduleModals } = require("./modals/scheduleModals");
const { handleTextStudioInteraction } = require("./studio/textStudio");
const { handleScheduleUIInteraction } = require("./scheduler/schedulerUI");


function registerPart2(client) {
  const { loadSchedulesFromDisk } = require("./scheduler/schedulerState");
  startCacheGC();
  loadSchedulesFromDisk();
  startScheduler(client);
  registerMessageLogs(client);
}

async function handlePart2Interaction(interaction) {
  // 1) Embed Studio (boutons + modals)
  if (await handleEmbedStudioInteraction(interaction)) return true;
if (await handleTextStudioInteraction(interaction)) return true;
if (await handleScheduleUIInteraction(interaction)) return true;

  // 2) Say text modal
  if (await handleSayModal(interaction)) return true;
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
