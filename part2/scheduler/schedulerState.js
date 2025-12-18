const fs = require("fs");
const path = require("path");

const persistFile = process.env.SCHED_PERSIST_FILE || "./data/part2_schedules.json";
const persistPath = path.resolve(process.cwd(), persistFile);

const schedulesByGuild = new Map(); // guildId -> Map(id -> schedule)
let nextId = 1;

function _ensureDir() {
  const dir = path.dirname(persistPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function _guildMap(guildId) {
  if (!schedulesByGuild.has(guildId)) schedulesByGuild.set(guildId, new Map());
  return schedulesByGuild.get(guildId);
}

function _now() {
  return Date.now();
}

function _normalizeLoadedSchedule(s) {
  const everyMs = Math.max(60_000, Number(s.everyMs || 0));
  const nextRunAt = Number(s.nextRunAt || _now() + everyMs);

  return {
    id: Number(s.id),
    guildId: String(s.guildId),
    channelId: String(s.channelId),
    type: s.type === "embed" ? "embed" : "text",
    everyMs,
    payload: s.payload || {},
    ping: s.ping || "",

    active: s.active !== false,
    paused: !!s.paused,

    createdBy: s.createdBy ? String(s.createdBy) : "unknown",
    createdAt: Number(s.createdAt || _now()),
    updatedAt: Number(s.updatedAt || _now()),

    runs: Number(s.runs || 0),
    lastRunAt: Number(s.lastRunAt || 0),
    lastError: s.lastError || null,

    nextRunAt,
  };
}

function saveSchedulesToDisk() {
  try {
    _ensureDir();
    const all = [];
    for (const [guildId, mp] of schedulesByGuild) {
      for (const sched of mp.values()) {
        all.push(sched);
      }
    }
    const payload = { nextId, schedules: all };
    fs.writeFileSync(persistPath, JSON.stringify(payload, null, 2), "utf8");
  } catch (e) {
    console.error("[sched] persist write error:", e);
  }
}

function loadSchedulesFromDisk() {
  try {
    if (!fs.existsSync(persistPath)) return;

    const raw = fs.readFileSync(persistPath, "utf8");
    const parsed = JSON.parse(raw);

    nextId = Math.max(1, Number(parsed?.nextId || 1));

    const arr = Array.isArray(parsed?.schedules) ? parsed.schedules : [];
    for (const s of arr) {
      const sched = _normalizeLoadedSchedule(s);
      _guildMap(sched.guildId).set(sched.id, sched);
      if (sched.id >= nextId) nextId = sched.id + 1;
    }

    console.log(`[sched] loaded ${arr.length} schedule(s) from ${persistFile}`);
  } catch (e) {
    console.error("[sched] persist read error:", e);
  }
}

function addSchedule({ guildId, channelId, type, everyMs, payload, createdBy, startDelayMs = 0, ping = "" }) {
  const id = nextId++;
  const now = _now();

  const sched = {
    id,
    guildId,
    channelId,
    type: type === "embed" ? "embed" : "text",
    everyMs: Math.max(60_000, Number(everyMs || 0)),
    payload: payload || {},
    ping: ping || "",

    active: true,
    paused: false,

    createdBy: String(createdBy || "unknown"),
    createdAt: now,
    updatedAt: now,

    runs: 0,
    lastRunAt: 0,
    lastError: null,

    nextRunAt: now + Math.max(0, Number(startDelayMs || 0)),
  };

  _guildMap(guildId).set(id, sched);
  saveSchedulesToDisk();
  return sched;
}

function listSchedules(guildId) {
  return Array.from(_guildMap(guildId).values()).sort((a, b) => a.id - b.id);
}

function getSchedule(guildId, id) {
  return _guildMap(guildId).get(Number(id)) || null;
}

function removeSchedule(guildId, id) {
  const ok = _guildMap(guildId).delete(Number(id));
  if (ok) saveSchedulesToDisk();
  return ok;
}

function pauseSchedule(guildId, id) {
  const s = getSchedule(guildId, id);
  if (!s) return null;
  s.paused = true;
  s.updatedAt = _now();
  saveSchedulesToDisk();
  return s;
}

function resumeSchedule(guildId, id) {
  const s = getSchedule(guildId, id);
  if (!s) return null;
  s.paused = false;
  s.updatedAt = _now();
  // reprend dans 5s pour éviter un “instant spam”
  s.nextRunAt = Math.max(s.nextRunAt, _now() + 5000);
  saveSchedulesToDisk();
  return s;
}

function editSchedule(guildId, id, patch) {
  const s = getSchedule(guildId, id);
  if (!s) return null;

  if (patch.channelId) s.channelId = String(patch.channelId);
  if (patch.everyMs) s.everyMs = Math.max(60_000, Number(patch.everyMs));
  if (typeof patch.ping === "string") s.ping = patch.ping;

  s.updatedAt = _now();
  // recalc next run (propre)
  s.nextRunAt = Math.max(_now() + 5000, s.nextRunAt);
  saveSchedulesToDisk();
  return s;
}

function runNowSchedule(guildId, id) {
  const s = getSchedule(guildId, id);
  if (!s) return null;
  s.nextRunAt = _now();
  s.updatedAt = _now();
  saveSchedulesToDisk();
  return s;
}

function computeDue(now = _now()) {
  const due = [];
  for (const [, mp] of schedulesByGuild) {
    for (const sched of mp.values()) {
      if (!sched.active) continue;
      if (sched.paused) continue;
      if (sched.nextRunAt <= now) due.push(sched);
    }
  }
  return due;
}

function bumpNextRun(sched, now = _now()) {
  const every = Math.max(60_000, sched.everyMs);
  let next = sched.nextRunAt;

  // catch-up max 3 fois
  const maxCatchup = 3;
  let count = 0;
  while (next <= now && count < maxCatchup) {
    next += every;
    count++;
  }
  if (next <= now) next = now + every;

  sched.nextRunAt = next;
  sched.updatedAt = now;
  saveSchedulesToDisk();
}

module.exports = {
  loadSchedulesFromDisk,
  saveSchedulesToDisk,

  addSchedule,
  listSchedules,
  getSchedule,
  removeSchedule,
  pauseSchedule,
  resumeSchedule,
  editSchedule,
  runNowSchedule,

  computeDue,
  bumpNextRun,
};
