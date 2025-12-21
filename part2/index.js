// part2/index.js — register + interaction router (commands + buttons + modals)
"use strict";

const { loadCommands, findCommand } = require("./commands");

// optional event modules
function safeRequire(p) {
  try { return require(p); } catch { return null; }
}

function pickFn(mod, names) {
  for (const n of names) {
    if (typeof mod?.[n] === "function") return mod[n];
  }
  return null;
}

function toEphemeral(interaction) {
  // discord.js v14 supports { ephemeral: true }.
  return { ephemeral: true };
}

function buildErrMsg(e) {
  const msg = String(e?.message || e || "Erreur inconnue");
  return msg.length > 1800 ? msg.slice(0, 1800) + "…" : msg;
}

function registerPart2(client) {
  // Load commands once at boot
  loadCommands({ silent: false });

  // Optional message logs
  const messageLogs = safeRequire("./events/messageLogs");
  const registerLogs = pickFn(messageLogs, ["register", "setup", "init"]);
  if (registerLogs) {
    try { registerLogs(client); } catch (e) { console.error("[part2] messageLogs register error:", e); }
  }

  // Optional scheduler runner
  const schedulerRunner = safeRequire("./scheduler/schedulerRunner");
  const registerSched = pickFn(schedulerRunner, ["register", "setup", "init", "start"]);
  if (registerSched) {
    try { registerSched(client); } catch (e) { console.error("[part2] schedulerRunner register error:", e); }
  }
}

async function handleComponentRouters(interaction) {
  // Staff router
  const staffComponents = safeRequire("./staff/staffComponents");
  const staffHandler = pickFn(staffComponents, [
    "handleStaffInteraction",
    "handleInteraction",
    "handleComponents",
    "handle",
  ]);
  if (staffHandler) {
    const ok = await staffHandler(interaction).catch(() => false);
    if (ok) return true;
  }

  // Autorole
  const autoroleComponents = safeRequire("./autorole/autoroleComponents");
  const autoroleHandler = pickFn(autoroleComponents, ["handleInteraction", "handleAutoroleInteraction", "handle"]);
  if (autoroleHandler) {
    const ok = await autoroleHandler(interaction).catch(() => false);
    if (ok) return true;
  }

  // Schedule modals/UI
  const scheduleModals = safeRequire("./modals/scheduleModals");
  const scheduleHandler = pickFn(scheduleModals, ["handleScheduleModals", "handleModals", "handleInteraction", "handle"]);
  if (scheduleHandler) {
    const ok = await scheduleHandler(interaction).catch(() => false);
    if (ok) return true;
  }
  const schedulerUI = safeRequire("./scheduler/schedulerUI");
  const schedulerHandler = pickFn(schedulerUI, ["handleSchedulerInteraction", "handleInteraction", "handleUI", "handle"]);
  if (schedulerHandler) {
    const ok = await schedulerHandler(interaction).catch(() => false);
    if (ok) return true;
  }

  // Tickets / apps / suggestions modules
  const tickets = safeRequire("./modules/tickets");
  const apps = safeRequire("./modules/applications");
  const sugg = safeRequire("./modules/suggestions");
  const welcomeLeave = safeRequire("./modules/welcomeLeave");
  const autoresponses = safeRequire("./modules/autoresponses");

  for (const mod of [tickets, apps, sugg, welcomeLeave, autoresponses]) {
    const h = pickFn(mod, ["handleInteraction", "handleComponents", "handleModals", "handle"]);
    if (!h) continue;
    const ok = await h(interaction).catch(() => false);
    if (ok) return true;
  }

  // Poll components (if used)
  const poll = safeRequire("./components/pollComponents");
  const pollHandler = pickFn(poll, ["handleInteraction", "handle"]);
  if (pollHandler) {
    const ok = await pollHandler(interaction).catch(() => false);
    if (ok) return true;
  }

  return false;
}

async function handlePart2Interaction(interaction) {
  // COMPONENTS / MODALS
  if (
    interaction.isButton?.() ||
    interaction.isAnySelectMenu?.() ||
    interaction.isModalSubmit?.()
  ) {
    try {
      const ok = await handleComponentRouters(interaction);
      return ok;
    } catch (e) {
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({ content: `❌ ${buildErrMsg(e)}`, ...toEphemeral(interaction) });
        } else {
          await interaction.followUp({ content: `❌ ${buildErrMsg(e)}`, ...toEphemeral(interaction) });
        }
      } catch {}
      return true;
    }
  }

  // SLASH COMMANDS
  if (!interaction.isChatInputCommand?.()) return false;

  const name = interaction.commandName;
  const cmd = findCommand(name);

  if (!cmd) return false;

  try {
    await cmd.execute(interaction);
  } catch (e) {
    console.error("[part2] command execute error:", name, e);
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ content: `❌ ${buildErrMsg(e)}`, ...toEphemeral(interaction) });
      } else {
        await interaction.editReply({ content: `❌ ${buildErrMsg(e)}` });
      }
    } catch {}
  }

  return true;
}

module.exports = { registerPart2, handlePart2Interaction };
