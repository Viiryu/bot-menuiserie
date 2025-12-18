// part2/say/ids.js
// IDs "namespacés" pour éviter tout conflit avec tes autres modules.

const SAY_IDS = Object.freeze({
  // Slash command
  CMD_SAY: "say",

  // Modals
  MODAL_TEXT: "P2_SAY_TEXT_MODAL",
  MODAL_EMBED_BASIC: "P2_SAY_EMBED_MODAL_BASIC",
  MODAL_EMBED_MEDIA: "P2_SAY_EMBED_MODAL_MEDIA",
  MODAL_ACTIONS: "P2_SAY_ACTIONS_MODAL",

  // Components (buttons / selects)
  BTN_PUBLISH: "P2_SAY_BTN_PUBLISH",
  BTN_TEST: "P2_SAY_BTN_TEST",
  BTN_EDIT_BASIC: "P2_SAY_BTN_EDIT_BASIC",
  BTN_EDIT_MEDIA: "P2_SAY_BTN_EDIT_MEDIA",
  BTN_EDIT_ACTIONS: "P2_SAY_BTN_EDIT_ACTIONS",
  BTN_TOGGLE_MENTIONS: "P2_SAY_BTN_TOGGLE_MENTIONS",
  BTN_CANCEL: "P2_SAY_BTN_CANCEL",

  SELECT_CHANNEL: "P2_SAY_SELECT_CHANNEL",
});

module.exports = { SAY_IDS };