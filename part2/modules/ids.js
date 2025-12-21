/**
 * part2/modules/ids.js
 * IDs des panels publics (tickets / candidatures / suggestions)
 */

const TICKETS_IDS = {
  PANEL_OPEN: "LGW_TICKETS:OPEN",
  TICKET_CLOSE: "LGW_TICKETS:CLOSE",
};

const APPLICATION_IDS = {
  PANEL_OPEN: "LGW_APPS:OPEN",
  MODAL: "LGW_APPS:MODAL",
  BTN_APPROVE_PREFIX: "LGW_APPS:APPROVE:",
  BTN_REJECT_PREFIX: "LGW_APPS:REJECT:",
};

const SUGGEST_IDS = {
  PANEL_OPEN: "LGW_SUGG:OPEN",
  MODAL: "LGW_SUGG:MODAL",
};

module.exports = { TICKETS_IDS, APPLICATION_IDS, SUGGEST_IDS };
