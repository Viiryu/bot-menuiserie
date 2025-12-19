// part2/index.js
const { startCacheGC } = require("./messageCache");
const { registerMessageLogs } = require("./events/messageLogs");
const { findCommand } = require("./commands");

// Schedule
const { startScheduler } = require("./scheduler/schedulerRunner");
const { handleScheduleModals } = require("./modals/scheduleModals");
const { handleScheduleUIInteraction } = require("./scheduler/schedulerUI");

// Say
const { handleSayModals } = require("./modals/sayModals");
const { handleSayComponents } = require("./components/sayComponents");

// Autorole
const { loadAutorolesFromDisk } = require("./autorole/autoroleState");
const { handleAutoroleInteraction } = require("./autorole/autoroleUI");
const { handleAutoroleComponents } = require("./autorole/autoroleComponents");

// Staff (NEW)
const { loadStaffConfig } = require("./staff/staffConfigState");
const { handleStaffComponents } = require("./staff/staffComponents");
const { handleStaffModals } = require("./staff/staffModals");
const { handleStaffModerationModals } = require("./staff/staffModerationModals");

// (optionnel) autocomplete presets /say
let handleSayPresetAutocomplete = null;
try {
  ({ handleSayPresetAutocomplete } = require("./autocomplete/sayPresetAutocomplete"));
} catch {}

/**
 * Register Part2 services
 */
function registerPart2(client) {
  const { loadSchedulesFromDisk } = require("./scheduler/schedulerState");

  startCacheGC();
  loadSchedulesFromDisk();
  loadAutorolesFromDisk();
  loadStaffConfig();

  startScheduler(client);
  registerMessageLogs(client);
}

/**
 * Global interaction router for Part2
 */
async function handlePart2Interaction(interaction) {
  // 0) Autocomplete (si présent)
  if (interaction.isAutocomplete?.() && handleSayPresetAutocomplete) {
    if (await handleSayPresetAutocomplete(interaction)) return true;
  }

  // 1) Staff UI (buttons/selects) + modals
  if (await handleStaffComponents(interaction)) return true;
  if (await handleStaffModerationModals(interaction)) return true;
  if (await handleStaffModals(interaction)) return true;

  // 2) Autorole (menus/boutons publics + wizard UI)
  if (await handleAutoroleComponents(interaction)) return true;
  if (await handleAutoroleInteraction(interaction)) return true;

  // 3) Say (select/boutons + modals)
  if (await handleSayComponents(interaction)) return true;
  if (await handleSayModals(interaction)) return true;

  // 4) Schedule (UI + modals)
  if (await handleScheduleUIInteraction(interaction)) return true;
  if (await handleScheduleModals(interaction)) return true;

  // 5) Slash commands Part2
  if (interaction.isChatInputCommand?.() && interaction.isChatInputCommand()) {
    const cmd = findCommand(interaction.commandName);
    if (!cmd) return false;

    // compat: certains exportent run, d’autres execute
    const fn = cmd.run || cmd.execute;
    if (!fn) return false;

    await fn(interaction);
    return true;
  }

  return false;
}

module.exports = { registerPart2, handlePart2Interaction };
