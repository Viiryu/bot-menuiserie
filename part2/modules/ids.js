// part2/modules/ids.js
// IDs CustomId (tickets / candidatures / suggestions)
// ✅ Compat multi-versions : exports alias anciens + nouveaux.

const TICKET_IDS = Object.freeze({
  // anciens (utilisés dans certains routers)
  OPEN: 'LGW_TICKETS:OPEN',
  CLOSE: 'LGW_TICKETS:CLOSE',
  // nouveaux (lisibles)
  PANEL_OPEN: 'LGW_TICKETS:OPEN',
  TICKET_CLOSE: 'LGW_TICKETS:CLOSE',
});

const APP_IDS = Object.freeze({
  OPEN: 'LGW_APPS:OPEN',
  MODAL: 'LGW_APPS:MODAL',
  APPROVE: 'LGW_APPS:APPROVE:',
  REJECT: 'LGW_APPS:REJECT:',

  PANEL_OPEN: 'LGW_APPS:OPEN',
  BTN_APPROVE_PREFIX: 'LGW_APPS:APPROVE:',
  BTN_REJECT_PREFIX: 'LGW_APPS:REJECT:',
});

const SUGG_IDS = Object.freeze({
  OPEN: 'LGW_SUGG:OPEN',
  MODAL: 'LGW_SUGG:MODAL',
  PANEL_OPEN: 'LGW_SUGG:OPEN',
});

// Legacy plural exports (some files still use them)
const TICKETS_IDS = TICKET_IDS;
const APPLICATION_IDS = APP_IDS;
const SUGGEST_IDS = SUGG_IDS;

module.exports = {
  TICKET_IDS,
  APP_IDS,
  SUGG_IDS,
  // aliases
  TICKETS_IDS,
  APPLICATION_IDS,
  SUGGEST_IDS,
};
