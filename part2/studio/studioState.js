const DRAFTS = new Map(); // key = userId

function createDraft(channelId) {
  return {
    channelId,
    createdAt: Date.now(),

    meta: {
      mode: "publish", // "publish" | "schedule" | "schedule_text"
      schedule: null,  // { guildId, channelId, everyMs, startDelayMs, type }
    },

    // Draft texte (scheduler)
    text: {
      content: "",
    },

    // Draft embed (embed studio)
    embed: {
      title: "",
      description: "",
      colorRaw: "",
      footerText: "",
      footerIcon: "",
      authorName: "",
      authorIcon: "",
      image: "",
      thumbnail: "",
      timestamp: false,
      fields: [],
    },
  };
}

function getDraft(userId) {
  return DRAFTS.get(userId) || null;
}

function ensureDraft(userId, channelId) {
  const cur = getDraft(userId);
  if (cur && cur.channelId === channelId) return cur;

  const next = createDraft(channelId);
  DRAFTS.set(userId, next);
  return next;
}

function setDraftMeta(userId, metaPatch) {
  const d = getDraft(userId);
  if (!d) return null;

  d.meta = d.meta || { mode: "publish", schedule: null };
  d.meta = { ...d.meta, ...(metaPatch || {}) };
  d.createdAt = Date.now();
  return d;
}

function updateDraft(userId, patchFn) {
  const cur = getDraft(userId);
  if (!cur) return null;
  patchFn(cur);
  cur.createdAt = Date.now();
  return cur;
}

function clearDraft(userId) {
  DRAFTS.delete(userId);
}

// Nettoyage auto (10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [uid, d] of DRAFTS) {
    if (now - d.createdAt > 10 * 60 * 1000) DRAFTS.delete(uid);
  }
}, 60_000).unref?.();

module.exports = { ensureDraft, getDraft, setDraftMeta, updateDraft, clearDraft };
