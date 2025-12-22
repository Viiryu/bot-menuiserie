// part2/index.js
// Router Part2 (staff + say + schedule + autorole + logs)
// ⚠️ Cette version est "safe": si un module n'existe pas, on ignore sans crash.

const { startCacheGC } = require("./messageCache");
const { registerMessageLogs } = require("./events/messageLogs");
const { findCommand } = require("./commands");

// Schedule
let startScheduler = null;
let handleScheduleModals = null;
let handleScheduleUIInteraction = null;
try {
  ({ startScheduler } = require("./scheduler/schedulerRunner"));
  ({ handleScheduleModals } = require("./modals/scheduleModals"));
  ({ handleScheduleUIInteraction } = require("./scheduler/schedulerUI"));
} catch {}

// Say
let handleSayModals = null;
let handleSayComponents = null;
let handleSayPresetAutocomplete = null;
try {
  ({ handleSayModals } = require("./modals/sayModals"));
  ({ handleSayComponents } = require("./components/sayComponents"));
} catch {}
try {
  ({ handleSayPresetAutocomplete } = require("./autocomplete/sayPresetAutocomplete"));
} catch {}

// Autorole
let loadAutorolesFromDisk = null;
let handleAutoroleInteraction = null;
let handleAutoroleComponents = null;
try {
  ({ loadAutorolesFromDisk } = require("./autorole/autoroleState"));
  ({ handleAutoroleInteraction } = require("./autorole/autoroleUI"));
  ({ handleAutoroleComponents } = require("./autorole/autoroleComponents"));
} catch {}

// Staff (panel + boutons + modals)
let handleStaffComponents = null;
let handleStaffUI = null;
let handleStaffModals = null;
let handleStaffModerationModals = null;

try {
  const staffComp = require("./staff/staffComponents");
  handleStaffComponents =
    staffComp.handleStaffInteraction ||
    staffComp.handleStaffComponents ||
    staffComp.handleStaffComponentInteraction ||
    null;
} catch {}
try {
  ({ handleStaffUI } = require("./staff/staffUI"));
} catch {}
try {
  ({ handleStaffModals } = require("./staff/staffModals"));
} catch {}
try {
  ({ handleStaffModerationModals } = require("./staff/staffModerationModals"));
} catch {}

/**
 * Register Part2 services
 */
function registerPart2(client) {
  try {
    startCacheGC();
  } catch {}

  // Scheduler state
  try {
    const { loadSchedulesFromDisk } = require("./scheduler/schedulerState");
    loadSchedulesFromDisk();
  } catch {}

  // Autoroles store
  try {
    if (typeof loadAutorolesFromDisk === "function") loadAutorolesFromDisk();
  } catch {}

  // Start scheduler
  try {
    if (typeof startScheduler === "function") startScheduler(client);
  } catch {}

  // Logs message
  try {
    registerMessageLogs(client);
  } catch (e) {
    console.error("[part2] registerMessageLogs error:", e);
  }
}

/**
 * Global interaction router for Part2
 * IMPORTANT: doit être appelé depuis bot.js sur chaque InteractionCreate
 */
async function handlePart2Interaction(interaction) {
  // 0) Autocomplete (si présent)
  if (interaction.isAutocomplete?.() && typeof handleSayPresetAutocomplete === "function") {
    if (await handleSayPresetAutocomplete(interaction)) return true;
  }

  // 1) Staff (boutons/selects + modals)
  if (typeof handleStaffComponents === "function") {
    if (await handleStaffComponents(interaction)) return true;
  }
  if (typeof handleStaffUI === "function") {
    if (await handleStaffUI(interaction)) return true;
  }
  if (typeof handleStaffModerationModals === "function") {
    if (await handleStaffModerationModals(interaction)) return true;
  }
  if (typeof handleStaffModals === "function") {
    if (await handleStaffModals(interaction)) return true;
  }

  // 2) Autorole (menus/boutons publics + wizard UI)
  if (typeof handleAutoroleComponents === "function") {
    if (await handleAutoroleComponents(interaction)) return true;
  }
  if (typeof handleAutoroleInteraction === "function") {
    if (await handleAutoroleInteraction(interaction)) return true;
  }

  // 3) Say (select/boutons + modals)
  if (typeof handleSayComponents === "function") {
    if (await handleSayComponents(interaction)) return true;
  }
  if (typeof handleSayModals === "function") {
    if (await handleSayModals(interaction)) return true;
  }

  // 4) Schedule (UI + modals)
  if (typeof handleScheduleUIInteraction === "function") {
    if (await handleScheduleUIInteraction(interaction)) return true;
  }
  if (typeof handleScheduleModals === "function") {
    if (await handleScheduleModals(interaction)) return true;
  }

  // 5) Slash commands Part2
  if (interaction.isChatInputCommand?.() && interaction.isChatInputCommand()) {
    const cmd = findCommand(interaction.commandName);
    if (!cmd) return false;

    // compat: certains exportent run, d’autres execute
    const fn = cmd.run || cmd.execute;
    if (typeof fn !== "function") return false;

    await fn(interaction);
    return true;
  }

  return false;
}

module.exports = { registerPart2, handlePart2Interaction };
