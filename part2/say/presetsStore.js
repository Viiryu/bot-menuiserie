// part2/say/presetsStore.js
const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");

const DATA_DIR = path.join(__dirname, "..", "data");
const PRESETS_DIR = path.join(DATA_DIR, "say-presets");

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PRESETS_DIR)) fs.mkdirSync(PRESETS_DIR, { recursive: true });
}

function guildFile(guildId) {
  return path.join(PRESETS_DIR, `${guildId}.json`);
}

function safePresetName(name) {
  const n = String(name || "").trim();
  if (!n) return null;
  if (n.length > 32) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(n)) return null;
  return n;
}

function serializeDraft(draft) {
  if (!draft || typeof draft !== "object") return null;

  const base = {
    v: 1,
    type: draft.type,
    channelId: draft.channelId || null,
    allowMentions: draft.allowMentions === true,
    buttons: Array.isArray(draft.buttons) ? draft.buttons : [],
    meta: draft.meta || {},
  };

  if (draft.type === "text") {
    base.text = { content: draft.text?.content || "" };
    return base;
  }

  if (draft.type === "embed") {
    const embedJson = draft.embed?.toJSON ? draft.embed.toJSON() : draft.embed;
    base.embed = embedJson || null;
    return base;
  }

  return null;
}

function deserializeDraft(saved, { guildId, ownerId, fallbackChannelId }) {
  if (!saved || typeof saved !== "object") return null;

  const draft = {
    type: saved.type,
    ownerId,
    guildId,
    channelId: saved.channelId || fallbackChannelId || null,
    allowMentions: saved.allowMentions === true,
    buttons: Array.isArray(saved.buttons) ? saved.buttons : [],
    meta: saved.meta || {},
  };

  if (draft.type === "text") {
    draft.text = { content: saved.text?.content || "" };
    return draft;
  }

  if (draft.type === "embed") {
    try {
      draft.embed = saved.embed ? EmbedBuilder.from(saved.embed) : new EmbedBuilder();
    } catch {
      draft.embed = new EmbedBuilder();
    }
    return draft;
  }

  return null;
}

function readGuildPresets(guildId) {
  ensureDirs();
  const file = guildFile(guildId);
  if (!fs.existsSync(file)) return { presets: {} };

  try {
    const raw = fs.readFileSync(file, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return { presets: {} };
    if (!data.presets || typeof data.presets !== "object") return { presets: {} };
    return data;
  } catch {
    return { presets: {} };
  }
}

function writeGuildPresets(guildId, data) {
  ensureDirs();
  const file = guildFile(guildId);
  const tmp = `${file}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function listPresetNames(guildId) {
  const data = readGuildPresets(guildId);
  return Object.keys(data.presets || {}).sort((a, b) => a.localeCompare(b));
}

function getPreset(guildId, name) {
  const safe = safePresetName(name);
  if (!safe) return null;
  const data = readGuildPresets(guildId);
  return data.presets?.[safe] || null;
}

function savePreset(guildId, name, draft) {
  const safe = safePresetName(name);
  if (!safe) return { ok: false, reason: "invalid_name" };

  const data = readGuildPresets(guildId);
  if (!data.presets) data.presets = {};

  const names = Object.keys(data.presets);
  if (!data.presets[safe] && names.length >= 25) return { ok: false, reason: "limit" };

  const serialized = serializeDraft(draft);
  if (!serialized) return { ok: false, reason: "invalid_draft" };

  data.presets[safe] = { updatedAt: Date.now(), payload: serialized };
  writeGuildPresets(guildId, data);
  return { ok: true };
}

function deletePreset(guildId, name) {
  const safe = safePresetName(name);
  if (!safe) return { ok: false, reason: "invalid_name" };

  const data = readGuildPresets(guildId);
  if (!data.presets?.[safe]) return { ok: false, reason: "not_found" };

  delete data.presets[safe];
  writeGuildPresets(guildId, data);
  return { ok: true };
}

module.exports = {
  safePresetName,
  listPresetNames,
  getPreset,
  savePreset,
  deletePreset,
  deserializeDraft,
};
