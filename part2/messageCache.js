const MSG_CACHE = new Map();
const TTL_MS = 1000 * 60 * 60 * 6; // 6 heures

function cacheMessage(message) {
  if (!message?.id || !message.guildId) return;
  if (!message.author || message.author.bot) return;

  MSG_CACHE.set(message.id, {
    id: message.id,
    guildId: message.guildId,
    channelId: message.channelId,
    authorId: message.author.id,
    authorTag: message.author.tag,
    content: message.content ?? "",
    attachments: [...message.attachments.values()].map((a) => a.url),
    cachedAt: Date.now(),
  });
}

function getCached(messageId) {
  return MSG_CACHE.get(messageId);
}

// Nettoyage automatique du cache (sinon ça grossit)
function startCacheGC() {
  setInterval(() => {
    const now = Date.now();
    for (const [id, v] of MSG_CACHE) {
      if (now - v.cachedAt > TTL_MS) MSG_CACHE.delete(id);
    }
  }, 60_000).unref?.();
}

module.exports = { cacheMessage, getCached, startCacheGC };
