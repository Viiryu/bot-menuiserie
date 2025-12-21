// part2/diagnostics/interactionGateway.js
// Petite "gateway" pour centraliser le routing des interactions et éviter les interactions qui échouent.
// Utilisation dans bot.js (voir README du pack).

const { traceInteraction, safeAcknowledge } = require("./interactionTrace");

/**
 * @param {object} handlers
 * @param {(interaction)=>Promise<boolean>} [handlers.handleSayModals]
 * @param {(interaction)=>Promise<boolean>} [handlers.handleSayComponents]
 * @param {(interaction)=>Promise<boolean>} [handlers.handlePart2Interaction]
 * @param {(level, source, action, message, meta)=>Promise<void>} [handlers.logEvent]
 */
function createInteractionGateway(handlers) {
  const {
    handleSayModals,
    handleSayComponents,
    handlePart2Interaction,
    logEvent,
  } = handlers || {};

  return async function interactionGateway(interaction) {
    let handled = false;
    try {
      // ⚡ ordre: modals -> components -> part2
      if (!handled && typeof handleSayModals === "function") {
        handled = (await handleSayModals(interaction)) || handled;
      }
      if (!handled && typeof handleSayComponents === "function") {
        handled = (await handleSayComponents(interaction)) || handled;
      }
      if (!handled && typeof handlePart2Interaction === "function") {
        handled = (await handlePart2Interaction(interaction)) || handled;
      }

      // Si c'est un component/modal et pas géré => ACK safe + log
      if (!handled && (interaction.isButton?.() || interaction.isAnySelectMenu?.() || interaction.isModalSubmit?.())) {
        await safeAcknowledge(interaction, "Interaction non gérée (router)");
        if (typeof logEvent === "function") {
          await logEvent("warn", "diag", "unhandled_interaction", "Une interaction n'a pas été routée", {
            type: interaction.type,
            cmd: interaction.commandName,
            customId: interaction.customId,
            userId: interaction.user?.id,
            guildId: interaction.guildId,
            channelId: interaction.channelId,
          }).catch(() => {});
        }
      }

      await traceInteraction(interaction, handled, null);
      return handled;
    } catch (err) {
      // En cas d'erreur => ACK safe + log + trace
      try {
        if (typeof logEvent === "function") {
          await logEvent("error", "diag", "interaction_error", String(err?.stack || err || ""), {
            cmd: interaction.commandName,
            customId: interaction.customId,
            userId: interaction.user?.id,
            guildId: interaction.guildId,
            channelId: interaction.channelId,
          }).catch(() => {});
        }
      } catch {}
      await traceInteraction(interaction, handled, err);
      await safeAcknowledge(interaction, "Erreur interne (voir logs console)");
      return true; // on considère "géré" car on a ACK
    }
  };
}

module.exports = { createInteractionGateway };
