// part2/say/ids.js

// Keep IDs short and consistent; Discord customId limit is 100 chars.
// These IDs are used by /say command, modals and components.

const SAY_IDS = {
  CMD_SAY: 'say',

  MODAL_TEXT: 'P2_SAY_TEXT_MODAL',
  MODAL_EMBED_BASIC: 'P2_SAY_EMBED_MODAL_BASIC',

  BTN_PUBLISH: 'P2_SAY_BTN_PUBLISH',
  BTN_CANCEL: 'P2_SAY_BTN_CANCEL',

  SELECT_CHANNEL: 'P2_SAY_SELECT_CHANNEL'
};

module.exports = { SAY_IDS };
