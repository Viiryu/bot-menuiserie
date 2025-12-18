/**
 * bot.js — LGW Comptabilité Bot (Machine de guerre) — PREMIUM EDITION
 *
 * ✅ Ultra-rapide ✅/❌ et /pay /unpay : update cellule Sheets via sheetRow (BOT_STATE) + update embed ciblé
 * ✅ Résumé + embeds unitaires pour 4 historiques (salaires / commandes / rachat employé / rachat temporaire)
 * ✅ /rebuild* et /rebuildall : purge + reposte résumé + unitaires (FORCE) — reposte même si lock (lock reste actif)
 * ✅ BOT_LINKS : /link /unlink /dellink + ping auto à la création (salaires)
 * ✅ Logs dans un channel + console
 * ✅ Cache Google Sheets + cache parse + cache state + cache header/colIndex
 * ✅ Autosync optionnel
 *
 * Dépendances :
 *   npm i discord.js dotenv googleapis express
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { google } = require("googleapis");

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  MessageFlagsBitField,
} = require("discord.js");

const { registerPart2, handlePart2Interaction } = require("./part2");

/* ===================== HTTP (Koyeb / UptimeRobot) ===================== */
const app = express();
app.get("/", (_, res) => res.status(200).send("OK"));
app.get("/healthz", (_, res) => res.status(200).send("healthy"));
const PORT = Number(process.env.PORT || 8000);
app.listen(PORT, () => console.log(`🌐 HTTP listening on ${PORT}`));

/* ===================== ENV ===================== */
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Channels
const LOGS_CHANNEL_ID = process.env.LOGS_CHANNEL_ID || "";
const SALAIRES_CHANNEL_ID = process.env.SALAIRES_CHANNEL_ID || "";
const COMMANDES_CHANNEL_ID = process.env.COMMANDES_CHANNEL_ID || "";
const RACHAT_EMPLOYE_CHANNEL_ID = process.env.RACHAT_EMPLOYE_CHANNEL_ID || "";
const RACHAT_TEMPORAIRE_CHANNEL_ID = process.env.RACHAT_TEMPORAIRE_CHANNEL_ID || "";

// Google
const GOOGLE_KEYFILE = process.env.GOOGLE_KEYFILE || "service-account.json";
const GOOGLE_SERVICE_ACCOUNT_JSON_B64 =
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64 || "";

// Roles (IDs séparés par virgule)
const PAY_ROLE_IDS = (process.env.PAY_ROLE_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Perf knobs
const FAST_MODE =
  String(process.env.FAST_MODE || "true").toLowerCase() === "true";
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 90); // cache Sheets/parse
const STATE_CACHE_TTL_SECONDS = Number(process.env.STATE_CACHE_TTL_SECONDS || 8); // cache états
const HEADER_CACHE_TTL_SECONDS = Number(process.env.HEADER_CACHE_TTL_SECONDS || 600); // cache header/indices
const MAX_ROWS_HISTORY = Number(process.env.MAX_ROWS_HISTORY || 2500); // ↓ plus bas = plus rapide
const DISCORD_OP_DELAY_MS = Number(process.env.DISCORD_OP_DELAY_MS || 0); // 0 = rapide

// Auto-sync
const AUTO_SYNC =
  String(process.env.AUTO_SYNC || "false").toLowerCase() === "true";
const AUTO_SYNC_INTERVAL_SECONDS = Number(
  process.env.AUTO_SYNC_INTERVAL_SECONDS || 180
);
const AUTO_SYNC_WEEKS_BACK = Number(process.env.AUTO_SYNC_WEEKS_BACK || 2);
const AUTO_SYNC_ON_START =
  String(process.env.AUTO_SYNC_ON_START || "true").toLowerCase() === "true";

// Logs autosync (évite spam dans #logs)
const AUTO_SYNC_LOG_RUNS =
  String(process.env.AUTO_SYNC_LOG_RUNS || "false").toLowerCase() === "true";

// Rebuild/Sync behavior
const REBUILD_IGNORE_LOCK =
  String(process.env.REBUILD_IGNORE_LOCK || "true").toLowerCase() === "true";

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN manquant.");
  process.exit(1);
}
if (!SPREADSHEET_ID) {
  console.error("❌ SPREADSHEET_ID manquant.");
  process.exit(1);
}

/* ===================== SHEETS (NOMS ONGLET) ===================== */
const SHEET_SALAIRES = "Historique salaires";
const SHEET_COMMANDES = "Historique commandes";
const SHEET_RACHAT_EMPLOYE = "Historique rachat employé";
const SHEET_RACHAT_TEMP = "Historique rachat temporaire";

// State sheets
const SHEET_BOT_STATE_SALAIRES = "BOT_STATE";
const SHEET_BOT_STATE_COMMANDES = "BOT_STATE_COMMANDES";
const SHEET_BOT_STATE_RACHAT_EMPLOYE = "BOT_STATE_RACHAT_EMPLOYE";
const SHEET_BOT_STATE_RACHAT_TEMP = "BOT_STATE_RACHAT_TEMP";
const SHEET_BOT_LINKS = "BOT_LINKS";
const SHEET_BOT_WEEK_SUMMARY = "BOT_WEEK_SUMMARY"; // résumé par semaine

/* ===================== THEME / COLORS ===================== */
const COLOR = {
  wood: 0x8b5e3c,
  blue: 0x3498db,
  green: 0x2ecc71,
  yellow: 0xf1c40f,
  purple: 0x9b59b6,
  red: 0xe74c3c,
  gray: 0x95a5a6,
  ink: 0x2c3e50,
  midnight: 0x111827, // premium dark
};

/* ===================== UTILS ===================== */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function discordDelay() {
  if (DISCORD_OP_DELAY_MS > 0) await sleep(DISCORD_OP_DELAY_MS);
}
function sha(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}
function normName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function isSeparatorRow(row) {
  const first = row?.[0];
  return typeof first === "string" && first.trim().startsWith("|");
}
function extractWeek(str) {
  const m = String(str || "").match(/(\d{4}-S\d{2})/);
  return m ? m[1] : null;
}
function boolLocked(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return ["true", "vrai", "1", "yes", "oui", "lock", "locked"].includes(s);
}
function weekToNumber(weekKey) {
  const m = String(weekKey || "").match(/^(\d{4})-S(\d{2})$/);
  if (!m) return -1;
  return Number(m[1]) * 100 + Number(m[2]);
}
function sortWeeksDesc(weeks) {
  return [...new Set(weeks)]
    .filter((w) => /^(\d{4})-S(\d{2})$/.test(String(w)))
    .sort((a, b) => weekToNumber(b) - weekToNumber(a));
}
function filterChoices(values, typed) {
  const t = String(typed || "").toLowerCase();
  return values
    .filter((v) => String(v).toLowerCase().includes(t))
    .slice(0, 25)
    .map((v) => ({
      name: String(v).slice(0, 100),
      value: String(v).slice(0, 100),
    }));
}
function safeMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? "—");
  const rounded = Math.round(n * 100) / 100;
  return rounded.toString();
}
function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) {
    // si déjà "250$" ou texte
    const s = String(v ?? "—");
    return s.includes("$") ? s : s;
  }
  return `${safeMoney(n)}$`;
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function pick(obj, names, fallback = "—") {
  for (const n of names) {
    const v = obj?.[n];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return fallback;
}
function findFirstColumn(header, candidates) {
  for (const c of candidates) {
    const idx = header.indexOf(c);
    if (idx !== -1) return idx;
  }
  return -1;
}
function statusEmoji(statutRaw) {
  const s = normName(statutRaw);
  if (s.includes("pay") && !s.includes("pas")) return "✅";
  if (s.includes("pas pay") || s.includes("impay") || s.includes("non pay"))
    return "❌";
  if (s.includes("vend")) return "✅";
  if (s.includes("stock")) return "📦";
  if (s.includes("cours") || s.includes("attent")) return "🕒";
  if (s.includes("term") || s.includes("livr") || s.includes("fait"))
    return "✅";
  return "🧾";
}
function statusColor(statutRaw) {
  const s = normName(statutRaw);
  if (s.includes("pay") && !s.includes("pas")) return COLOR.green;
  if (s.includes("pas pay") || s.includes("non pay") || s.includes("impay"))
    return COLOR.red;
  return COLOR.gray;
}
function gradeColor(gradeRaw) {
  const g = normName(gradeRaw);
  if (g.includes("patron") && !g.includes("co")) return 0xe74c3c;
  if (g.includes("co") && g.includes("patron")) return 0x9b59b6;
  if (g.includes("formation")) return 0x95a5a6;
  if (g.includes("employ")) return 0x3498db;
  return COLOR.wood;
}
function splitEntrepriseLieu(raw) {
  const s = String(raw || "").trim();
  if (!s) return { entreprise: "—", lieu: "—" };
  const seps = [" – ", " — ", " - "];
  for (const sep of seps) {
    const idx = s.indexOf(sep);
    if (idx !== -1) {
      const a = s.slice(0, idx).trim();
      const b = s.slice(idx + sep.length).trim();
      return { entreprise: a || "—", lieu: b || "—" };
    }
  }
  return { entreprise: s, lieu: "—" };
}
function clamp(str, n) {
  const s = String(str ?? "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function colToA1(colIndex0) {
  // 0->A, 25->Z, 26->AA ...
  let n = colIndex0 + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/* ===================== SIMPLE IN-MEMORY CACHE ===================== */
function ttlMs(seconds) {
  return Math.max(0, Number(seconds) || 0) * 1000;
}
const _cache = new Map(); // key -> {ts, ttl, value}
function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > hit.ttl) {
    _cache.delete(key);
    return null;
  }
  return hit.value;
}
function cacheSet(key, value, seconds) {
  _cache.set(key, { ts: Date.now(), ttl: ttlMs(seconds), value });
  return value;
}
function cacheDelPrefix(prefix) {
  for (const k of _cache.keys()) {
    if (k.startsWith(prefix)) _cache.delete(k);
  }
}

/* ===================== GOOGLE: keyfile from base64 env ===================== */
function ensureKeyfileFromB64() {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON_B64) return;
  try {
    const out = Buffer.from(GOOGLE_SERVICE_ACCOUNT_JSON_B64, "base64").toString(
      "utf8"
    );
    fs.writeFileSync(path.join(__dirname, GOOGLE_KEYFILE), out, "utf8");
    console.log("✅ service-account.json écrit depuis base64");
  } catch (e) {
    console.error("❌ write keyfile base64:", e?.message || e);
  }
}
ensureKeyfileFromB64();

/* ===================== GOOGLE SHEETS CLIENT ===================== */
let _sheets = null;
async function getSheets() {
  if (_sheets) return _sheets;
  const auth = new google.auth.GoogleAuth({
    keyFile: GOOGLE_KEYFILE,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  _sheets = google.sheets({ version: "v4", auth });
  return _sheets;
}
async function sheetTitles(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  return (meta.data.sheets || [])
    .map((s) => s.properties?.title)
    .filter(Boolean);
}
async function ensureSheet(sheets, title) {
  const titles = await sheetTitles(sheets);
  if (!titles.includes(title)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
  }
}
async function readRange(sheets, range) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return res.data.values || [];
}
async function updateCell(sheets, rangeA1, value) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: rangeA1,
    valueInputOption: "RAW",
    requestBody: { values: [[value]] },
  });
}
async function readSheetTableCached(
  sheets,
  sheetName,
  maxRows = MAX_ROWS_HISTORY
) {
  const key = `table::${sheetName}::${maxRows}`;
  const hit = FAST_MODE ? cacheGet(key) : null;
  if (hit) return hit;

  const table = await readRange(sheets, `${sheetName}!A1:ZZ${maxRows}`);
  return cacheSet(key, table, CACHE_TTL_SECONDS);
}
function invalidateSheetCache(sheetName) {
  cacheDelPrefix(`table::${sheetName}::`);
  cacheDelPrefix(`parsed::${sheetName}::`);
  cacheDelPrefix(`header::${sheetName}::`);
}
async function ensureSheetColumns(sheets, sheetTitle, requiredHeader) {
  const cur = await readRange(sheets, `${sheetTitle}!A1:ZZ1`);
  const header = (cur[0] || []).map((x) => String(x || "").trim());
  if (!header.length) {
    const endCol = colToA1(requiredHeader.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetTitle}!A1:${endCol}1`,
      valueInputOption: "RAW",
      requestBody: { values: [requiredHeader] },
    });
    return;
  }
  if (header.length >= requiredHeader.length) return;

  const newHeader = [...header];
  for (let i = header.length; i < requiredHeader.length; i++) {
    newHeader[i] = requiredHeader[i] || "";
  }

  const endCol = colToA1(newHeader.length - 1);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetTitle}!A1:${endCol}1`,
    valueInputOption: "RAW",
    requestBody: { values: [newHeader] },
  });
}

/* ===================== HEADER/COL INDEX CACHE (FAST PAY/REACTIONS) ===================== */
async function getHeaderMapCached(sheets, sheetName) {
  const key = `header::${sheetName}`;
  const hit = FAST_MODE ? cacheGet(key) : null;
  if (hit) return hit;

  const header = (await readRange(sheets, `${sheetName}!A1:ZZ1`))[0] || [];
  const clean = header.map((h) => String(h || "").trim());
  const map = new Map();
  for (let i = 0; i < clean.length; i++) {
    if (!clean[i]) continue;
    map.set(clean[i], i);
  }
  return cacheSet(key, { header: clean, map }, HEADER_CACHE_TTL_SECONDS);
}
async function readRowObject(sheets, sheetName, rowIndex) {
  const { header } = await getHeaderMapCached(sheets, sheetName);
  const endCol = colToA1(Math.max(0, header.length - 1));
  const row =
    (await readRange(sheets, `${sheetName}!A${rowIndex}:${endCol}${rowIndex}`))[0] ||
    [];
  const obj = {};
  for (let i = 0; i < header.length; i++) {
    const k = header[i];
    if (!k) continue;
    obj[k] = row[i];
  }
  return obj;
}

/* ===================== PARSE HISTORY (cached) ===================== */
function parseHistory(table) {
  const header = (table[0] || []).map((h) => String(h || "").trim());
  const idxWeek = header.indexOf("Semaine");
  let currentWeek = null;
  const records = [];

  for (let i = 1; i < table.length; i++) {
    const row = table[i] || [];

    if (isSeparatorRow(row)) {
      const wk = extractWeek(row[0]);
      if (wk) currentWeek = wk;
      continue;
    }

    let weekKey = null;
    if (idxWeek !== -1) weekKey = extractWeek(row[idxWeek]);
    if (!weekKey) weekKey = currentWeek;
    if (!weekKey) continue;

    const obj = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c];
      if (!key) continue;
      obj[key] = row[c];
    }

    records.push({
      week: weekKey,
      rowIndex: i + 1, // 1-based
      raw: row,
      obj,
      header,
    });
  }

  return { header, records };
}
async function getParsedCached(sheets, sheetName, maxRows = MAX_ROWS_HISTORY) {
  const key = `parsed::${sheetName}::${maxRows}`;
  const hit = FAST_MODE ? cacheGet(key) : null;
  if (hit) return hit;

  const table = await readSheetTableCached(sheets, sheetName, maxRows);
  const parsed = parseHistory(table);
  return cacheSet(key, parsed, CACHE_TTL_SECONDS);
}

/* ===================== DISCORD CLIENT ===================== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.Reaction,
    Partials.User,
  ],
});

// ===================== PART2 (logs/modération/communication) =====================
registerPart2(client);


/* ===================== AUTH ===================== */
function hasPayRole(member) {
  try {
    if (!member) return false;
    if (member.permissions?.has?.("Administrator")) return true;
    if (!PAY_ROLE_IDS.length) return true;
    const roles = member.roles?.cache;
    if (!roles) return false;
    return PAY_ROLE_IDS.some((id) => roles.has(id));
  } catch {
    return false;
  }
}
async function resolveTextChannel(channelId) {
  if (!channelId) return null;
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch && ch.isTextBased?.()) return ch;
  } catch {}
  return null;
}

/* ===================== LOGGING ===================== */
let _logsChannelCache = null;
async function resolveLogsChannel() {
  if (!LOGS_CHANNEL_ID) return null;
  if (_logsChannelCache) return _logsChannelCache;
  try {
    const ch = await client.channels.fetch(LOGS_CHANNEL_ID);
    if (ch && ch.isTextBased?.()) {
      _logsChannelCache = ch;
      return ch;
    }
  } catch {}
  return null;
}
function nowStr() {
  const d = new Date();
  return d.toISOString().replace("T", " ").replace("Z", "");
}
const LOG_COLORS = { info: COLOR.green, warn: COLOR.yellow, error: COLOR.red };
const LOG_ICONS = { info: "✅", warn: "⚠️", error: "❌" };

let _logEventLast = new Map();
const LOG_THROTTLE_MS = Number(process.env.LOG_THROTTLE_MS || 2000);


async function logEvent(level, source, action, message, meta = {}) {
  try {
    console.log(`[${String(level).toUpperCase()}] ${source} • ${action} ${message}`);

    // Si le bot n'est pas prêt, on évite d'essayer Discord (console only)
    if (!client?.isReady?.()) return;

    const ch = await resolveLogsChannel();
    if (!ch) return;

    // Anti-spam: throttle logs identiques
    const key = `${level}|${source}|${action}|${String(message).slice(0, 160)}`;
    const now = Date.now();
    const last = _logEventLast.get(key) || 0;
    if (now - last < LOG_THROTTLE_MS) return;
    _logEventLast.set(key, now);

    const embed = new EmbedBuilder()
      .setColor(LOG_COLORS[level] ?? COLOR.gray)
      .setTitle(`${LOG_ICONS[level] ?? "📝"} ${source}`)
      .setDescription(`**${action}**\n${clamp(message, 3800)}`)
      .setFooter({ text: nowStr() })
      .setTimestamp(new Date());

    const fields = [];
    for (const [k, v] of Object.entries(meta || {})) {
      if (v === undefined || v === null || String(v).trim() === "") continue;
      fields.push({
        name: String(k).slice(0, 256),
        value: String(v).slice(0, 1024),
        inline: true,
      });
    }
    if (fields.length) embed.addFields(fields.slice(0, 24));

    await ch.send({ embeds: [embed] }).catch(() => {});
  } catch (e) {
    // IMPORTANT: ne jamais throw ici (sinon boucle unhandledRejection)
    console.error("[logEvent] failed:", e?.message || e);
  }
}


/* ===================== LINKS (BOT_LINKS) ===================== */
let _linksCache = { ts: 0, map: new Map() };
async function readLinks(sheets) {
  await ensureSheet(sheets, SHEET_BOT_LINKS);
  await ensureSheetColumns(sheets, SHEET_BOT_LINKS, [
    "telegramme",
    "employeName",
    "discordUserId",
    "active",
    "updatedAt",
  ]);
  return await readRange(sheets, `${SHEET_BOT_LINKS}!A1:E2000`);
}
async function getLinksMapCached(sheets) {
  const now = Date.now();
  if (now - _linksCache.ts < 60_000 && _linksCache.map.size)
    return _linksCache.map;

  const rows = await readLinks(sheets);
  const map = new Map();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const employeName = r[1];
    const discordUserId = r[2];
    const active = String(r[3] || "").toLowerCase() === "true";
    if (!active) continue;
    if (!employeName || !discordUserId) continue;
    map.set(normName(employeName), String(discordUserId));
  }

  _linksCache = { ts: now, map };
  return map;
}
async function upsertLink(
  sheets,
  { telegramme, employeName, discordUserId, active }
) {
  const rows = await readLinks(sheets);
  const now = new Date().toISOString();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (String(r[2] || "") === String(discordUserId)) {
      const rowNum = i + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_BOT_LINKS}!A${rowNum}:E${rowNum}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [
            [
              telegramme || "",
              employeName || "",
              String(discordUserId),
              String(!!active),
              now,
            ],
          ],
        },
      });
      _linksCache = { ts: 0, map: new Map() };
      return { action: "updated" };
    }
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_BOT_LINKS}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          telegramme || "",
          employeName || "",
          String(discordUserId),
          String(!!active),
          now,
        ],
      ],
    },
  });

  _linksCache = { ts: 0, map: new Map() };
  return { action: "created" };
}
async function deactivateLink(sheets, discordUserId) {
  const rows = await readLinks(sheets);
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (String(r[2] || "") === String(discordUserId)) {
      const rowNum = i + 1;
      await updateCell(sheets, `${SHEET_BOT_LINKS}!D${rowNum}`, "false");
      await updateCell(
        sheets,
        `${SHEET_BOT_LINKS}!E${rowNum}`,
        new Date().toISOString()
      );
      _linksCache = { ts: 0, map: new Map() };
      return { action: "disabled" };
    }
  }
  return { action: "not_found" };
}
async function deleteLinkRow(sheets, discordUserId) {
  const rows = await readLinks(sheets);
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });
  const sheet = (meta.data.sheets || []).find(
    (s) => s.properties?.title === SHEET_BOT_LINKS
  );
  if (!sheet) return { action: "no_sheet" };

  const sheetId = sheet.properties.sheetId;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (String(r[2] || "") === String(discordUserId)) {
      const startIndex = i; // 0-based
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId,
                  dimension: "ROWS",
                  startIndex,
                  endIndex: startIndex + 1,
                },
              },
            },
          ],
        },
      });
      _linksCache = { ts: 0, map: new Map() };
      return { action: "deleted" };
    }
  }
  return { action: "not_found" };
}
async function getEmployeNameByDiscordId(sheets, discordUserId) {
  const rows = await readLinks(sheets);
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (String(r[2] || "") === String(discordUserId)) {
      const active = String(r[3] || "").toLowerCase() === "true";
      if (!active) return null;
      return String(r[1] || "").trim() || null;
    }
  }
  return null;
}

/* ===================== STATE SHEETS ===================== */
async function ensureStateSheet(sheets, title) {
  await ensureSheet(sheets, title);
  await ensureSheetColumns(sheets, title, [
    "key",
    "week",
    "name",
    "channelId",
    "messageId",
    "locked",
    "hash",
  ]);
}

const SALAIRES_STATE_HEADER = [
  "key",
  "week",
  "employeName",
  "grade",
  "telegramme",
  "channelId",
  "messageId",
  "locked",
  "hash",
  "sheetRow", // ✅ pour update ultra-rapide
];

async function ensureStateSheetSalaires(sheets) {
  await ensureSheet(sheets, SHEET_BOT_STATE_SALAIRES);
  await ensureSheetColumns(sheets, SHEET_BOT_STATE_SALAIRES, SALAIRES_STATE_HEADER);
}

async function readStateRowsCached(sheets, sheetTitle, max = 5000) {
  const key = `state::${sheetTitle}::${max}`;
  const hit = FAST_MODE ? cacheGet(key) : null;
  if (hit) return hit;

  await ensureStateSheet(sheets, sheetTitle);
  const rows = await readRange(sheets, `${sheetTitle}!A1:G${max}`);
  return cacheSet(key, rows, STATE_CACHE_TTL_SECONDS);
}

async function readStateRowsSalairesCached(sheets, max = 5000) {
  const key = `state::${SHEET_BOT_STATE_SALAIRES}::${max}`;
  const hit = FAST_MODE ? cacheGet(key) : null;
  if (hit) return hit;

  await ensureStateSheetSalaires(sheets);
  const rows = await readRange(sheets, `${SHEET_BOT_STATE_SALAIRES}!A1:J${max}`);
  return cacheSet(key, rows, STATE_CACHE_TTL_SECONDS);
}

function invalidateStateCache(sheetTitle) {
  cacheDelPrefix(`state::${sheetTitle}::`);
}

/* ===================== WEEK SUMMARY STATE ===================== */
async function ensureWeekSummarySheet(sheets) {
  await ensureSheet(sheets, SHEET_BOT_WEEK_SUMMARY);
  await ensureSheetColumns(sheets, SHEET_BOT_WEEK_SUMMARY, [
    "key",
    "week",
    "kind",
    "channelId",
    "messageId",
    "hash",
  ]);
}
async function readWeekSummaryStateCached(sheets, max = 3000) {
  const key = `weekSummary::${max}`;
  const hit = FAST_MODE ? cacheGet(key) : null;
  if (hit) return hit;

  await ensureWeekSummarySheet(sheets);
  const rows = await readRange(sheets, `${SHEET_BOT_WEEK_SUMMARY}!A1:F${max}`);
  return cacheSet(key, rows, STATE_CACHE_TTL_SECONDS);
}
async function writeWeekSummaryState(sheets, values) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_BOT_WEEK_SUMMARY}!A1:F${values.length}`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
  cacheDelPrefix("weekSummary::");
}
async function upsertWeekSummaryMessage({
  sheets,
  kind,
  weekKey,
  channelId,
  embed,
  hash,
  force = false,
}) {
  await ensureWeekSummarySheet(sheets);
  const ch = await resolveTextChannel(channelId);
  if (!ch) throw new Error("Channel résumé introuvable.");

  const state = await readWeekSummaryStateCached(sheets);
  const head = state[0] || ["key", "week", "kind", "channelId", "messageId", "hash"];
  const rows = state.slice(1);

  const key = `SUMMARY::${kind}::${weekKey}`;

  let found = null;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i]?.[0] || "") === key) {
      found = { i, row: rows[i] };
      break;
    }
  }

  if (!force && found && String(found.row[5] || "") === hash)
    return { action: "skipped" };

  if (found && found.row[4]) {
    try {
      const msg = await ch.messages.fetch(String(found.row[4]));
      await msg.edit({ embeds: [embed] });
      await discordDelay();
      found.row[3] = channelId;
      found.row[5] = hash;
      await writeWeekSummaryState(sheets, [head, ...rows]);
      return { action: "edited" };
    } catch {
      // message supprimé -> create
    }
  }

  const msg = await ch.send({ embeds: [embed] });
  await discordDelay();

  if (found) {
    found.row[1] = weekKey;
    found.row[2] = kind;
    found.row[3] = channelId;
    found.row[4] = msg.id;
    found.row[5] = hash;
  } else {
    rows.push([key, weekKey, kind, channelId, msg.id, hash]);
  }

  await writeWeekSummaryState(sheets, [head, ...rows]);
  return { action: "created" };
}

/* ===================== SALAIRES: lock / status / update ===================== */
async function isWeekLocked(sheets, weekKey) {
  const rows = await readStateRowsSalairesCached(sheets);
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (String(r[1] || "") !== String(weekKey)) continue;
    if (boolLocked(r[7])) return true;
  }
  return false;
}
async function lockWeek(sheets, weekKey, lockValue) {
  const rows = await readStateRowsSalairesCached(sheets);
  let changed = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (String(r[1] || "") !== String(weekKey)) continue;
    r[7] = lockValue ? "true" : "";
    changed++;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_BOT_STATE_SALAIRES}!A1:J${rows.length}`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });

  invalidateStateCache(SHEET_BOT_STATE_SALAIRES);
  return changed;
}

function computeSalairesStatusFromParsed(parsed, weekKey) {
  const header = parsed.header;
  const records = parsed.records;

  const idxStatut = header.indexOf("Statut au moment de la clôture");
  const idxTotalPaye = header.indexOf("Total payé");
  const idxSalaire = header.indexOf("Salaire");
  const idxPrime = header.indexOf("Prime");
  const idxProd = header.indexOf("Quantité totale produite");
  const idxMontantRachat = header.indexOf("Montant rachat");

  let count = 0;
  let paid = 0;
  let unpaid = 0;

  let totalPaid = 0;
  let totalSalaire = 0;
  let totalPrime = 0;
  let totalProd = 0;
  let totalRachatMontant = 0;

  for (const r of records) {
    if (r.week !== weekKey) continue;
    const name = String(r.obj["Prénom et nom"] || "").trim();
    if (!name) continue;

    count++;

    const statut =
      idxStatut !== -1
        ? String(r.obj[header[idxStatut]] || "")
        : String(r.obj["Statut au moment de la clôture"] || "");

    if (normName(statut).includes("pay") && !normName(statut).includes("pas"))
      paid++;
    else unpaid++;

    const tp =
      idxTotalPaye !== -1
        ? r.obj[header[idxTotalPaye]]
        : r.obj["Total payé"];
    totalPaid += Number(tp) || 0;

    if (idxSalaire !== -1) totalSalaire += Number(r.obj[header[idxSalaire]]) || 0;
    if (idxPrime !== -1) totalPrime += Number(r.obj[header[idxPrime]]) || 0;
    if (idxProd !== -1) totalProd += Number(r.obj[header[idxProd]]) || 0;
    if (idxMontantRachat !== -1)
      totalRachatMontant += Number(r.obj[header[idxMontantRachat]]) || 0;
  }

  return {
    count,
    paid,
    unpaid,
    totalPaid,
    totalSalaire,
    totalPrime,
    totalProd,
    totalRachatMontant,
  };
}

/**
 * ✅ UPDATE STATUT (ULTRA RAPIDE)
 * - On tente d'abord via BOT_STATE (sheetRow)
 * - Sinon fallback parse (rare)
 */
async function updateSalaireStatusFast(sheets, weekKey, employeName, newStatus) {
  const stateRows = await readStateRowsSalairesCached(sheets);
  const data = stateRows.slice(1);

  const targetNorm = normName(employeName);
  let sheetRow = 0;

  for (const r of data) {
    const w = String(r?.[1] || "");
    const n = String(r?.[2] || "");
    if (w === String(weekKey) && normName(n) === targetNorm) {
      sheetRow = Number(r?.[9] || 0);
      break;
    }
  }

  const { map } = await getHeaderMapCached(sheets, SHEET_SALAIRES);
  const idxStatut = map.get("Statut au moment de la clôture");

  if (idxStatut === undefined) {
    throw new Error("Colonne 'Statut au moment de la clôture' introuvable.");
  }

  if (sheetRow > 0) {
    const col = colToA1(idxStatut);
    await updateCell(sheets, `${SHEET_SALAIRES}!${col}${sheetRow}`, newStatus);
    invalidateSheetCache(SHEET_SALAIRES);
    return true;
  }

  // fallback parse (si state pas à jour)
  const parsed = await getParsedCached(sheets, SHEET_SALAIRES);
  const header = parsed.header;
  const records = parsed.records;
  const idxName = header.indexOf("Prénom et nom");
  const idxStatut2 = header.indexOf("Statut au moment de la clôture");

  if (idxName === -1 || idxStatut2 === -1) {
    throw new Error("Colonnes manquantes dans Historique salaires.");
  }

  for (const r of records) {
    if (r.week !== weekKey) continue;
    const n = String(r.obj[header[idxName]] || "").trim();
    if (normName(n) !== targetNorm) continue;

    const col = colToA1(idxStatut2);
    await updateCell(sheets, `${SHEET_SALAIRES}!${col}${r.rowIndex}`, newStatus);
    invalidateSheetCache(SHEET_SALAIRES);
    return true;
  }

  return false;
}

/* ===================== STATUS (Commandes / Rachats) ===================== */
function computeCommandesStatusFromParsed(parsed, weekKey) {
  const header = parsed.header;
  const records = parsed.records;
  const idxAmount = findFirstColumn(header, [
    "Montant",
    "Total",
    "Prix",
    "Montant total",
  ]);

  let count = 0;
  let total = 0;

  for (const r of records) {
    if (r.week !== weekKey) continue;
    const hasAny = Object.values(r.obj || {}).some(
      (v) => String(v ?? "").trim() !== ""
    );
    if (!hasAny) continue;

    count++;
    if (idxAmount !== -1) total += Number(r.obj[header[idxAmount]]) || 0;
  }

  return { count, total };
}
function computeGenericRachatStatsFromParsed(parsed, weekKey) {
  const header = parsed.header;
  const records = parsed.records;
  const idxAmount = findFirstColumn(header, [
    "Montant",
    "Total",
    "Prix",
    "Montant total",
    "Montant rachat",
  ]);

  let count = 0;
  let total = 0;

  for (const r of records) {
    if (r.week !== weekKey) continue;
    const hasAny = Object.values(r.obj || {}).some(
      (v) => String(v ?? "").trim() !== ""
    );
    if (!hasAny) continue;

    count++;
    if (idxAmount !== -1) total += Number(r.obj[header[idxAmount]]) || 0;
  }

  return { count, total };
}

/* ===================== PREMIUM EMBEDS (MAXI LISIBLE) ===================== */
function botIconUrl() {
  try {
    return client.user?.displayAvatarURL?.() || null;
  } catch {
    return null;
  }
}
function fmtLine(label, value) {
  const v = value === undefined || value === null || String(value).trim() === "" ? "—" : String(value);
  return `**${label}** : ${v}`;
}
function bullet(lines) {
  return lines.filter(Boolean).map((l) => `• ${l}`).join("\n");
}
function bigTotalPaid(v) {
  return `💵 **TOTAL PAYÉ : ${money(v)}**`;
}

/* ===== SALAIRES (TOTAL PAYÉ en GROS + statut très visible) ===== */
function buildSalaireEmbedPremium(weekKey, obj) {
  const name = String(pick(obj, ["Prénom et nom"], "Employé"));
  const grade = String(pick(obj, ["Grade"], "—"));

  const statut = String(
    pick(obj, ["Statut au moment de la clôture", "Statut"], "—")
  );
  const stEmoji = statusEmoji(statut);
  const stColor = statusColor(statut);
  const color = stColor !== COLOR.gray ? stColor : gradeColor(grade);

  const salaire = num(pick(obj, ["Salaire"], 0));
  const prime = num(pick(obj, ["Prime"], 0));
  const totalSalaire = salaire + prime;

  const totalPaye = num(pick(obj, ["Total payé"], 0));
  const prod = pick(obj, ["Quantité totale produite", "Production"], "—");

  const totalRachat = num(pick(obj, ["Total rachat"], 0));
  const montantRachat = num(pick(obj, ["Montant rachat"], 0));

  const paid =
    normName(statut).includes("pay") && !normName(statut).includes("pas");
  const badge = paid ? "🟢 **PAYÉ**" : "🔴 **PAS PAYÉ**";

  const header = [
    `📅 **Semaine : ${weekKey}**`,
    `👤 **Employé : ${name}**`,
    `🎖️ **Grade : ${grade}**`,
    `📌 Statut : ${badge}`,
    "",
    bigTotalPaid(totalPaye),
  ].join("\n");

  const fRemu = bullet([
    fmtLine("Salaire", money(salaire)),
    fmtLine("Prime", money(prime)),
    `—`,
    fmtLine("Total salaire", money(totalSalaire)),
  ]);

  const fAct = bullet([
    fmtLine("Production", prod),
    `—`,
    fmtLine("Total payé", money(totalPaye)),
  ]);

  const fRach = bullet([
    fmtLine("Total rachat", safeMoney(totalRachat)),
    fmtLine("Montant rachat", money(montantRachat)),
  ]);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${stEmoji} Salaire — ${name}`)
    .setDescription(header)
    .addFields(
      { name: "💰 Rémunération", value: fRemu || "—", inline: true },
      { name: "🪵 Activité", value: fAct || "—", inline: true },
      { name: "🔁 Rachats", value: fRach || "—", inline: true }
    )
    .setFooter({ text: `TOTAL PAYÉ : ${money(totalPaye)} • ${weekKey}` })
    .setTimestamp(new Date());

  const icon = botIconUrl();
  if (icon) embed.setAuthor({ name: "Le Secrétaire — Salaires", iconURL: icon });

  return embed;
}

/* ===== COMMANDES (statut fixé, article+qté, client scindé, contact 2 lignes) ===== */
function buildCommandeEmbedPremium(weekKey, obj) {
  const entrepriseRaw = pick(
    obj,
    ["Entreprise", "Client", "Société", "Societe", "Entreprise / Lieu", "Entreprise - Lieu"],
    "—"
  );
  const { entreprise, lieu } = splitEntrepriseLieu(entrepriseRaw);

  const contactName = pick(
    obj,
    ["Contact", "Interlocuteur", "Nom du contact", "Contact client", "Client (contact)"],
    ""
  );
  const contactTel = pick(
    obj,
    ["Télégramme contact", "Telegramme contact", "Télégramme", "Telegramme", "Tel", "Télégramme client"],
    ""
  );

  const telNorm = String(contactTel || "").replace(/^LGW-?/i, "");
  const contactLine =
    contactName && telNorm
      ? `**Contact :** ${contactName} | LGW-${telNorm}`
      : contactName
      ? `**Contact :** ${contactName}`
      : telNorm
      ? `**Contact :** LGW-${telNorm}`
      : `**Contact :** —`;

  const article = pick(
    obj,
    [
      "Article",
      "Article commandé",
      "Article commande",
      "Produit",
      "Produit commandé",
      "Produit commande",
      "Type",
      "Item",
      "Objet",
      "Libellé",
      "Libelle",
      "Désignation",
      "Designation",
      "Commande",
      "Produit (petit-bois/bois traité)",
      "Produit (petit-bois / bois traité)",
      "Produit (petit bois/bois traité)",
      "Produit (petit bois / bois traité)",
    ],
    "—"
  );

  const qty = pick(
    obj,
    ["Quantité", "Qté", "Qte", "Nombre", "Nb", "Quantité commandée", "Quantite commandee"],
    "—"
  );

  const montant = pick(obj, ["Montant", "Prix", "Total", "Montant total"], "—");

  const embed = new EmbedBuilder()
    .setColor(COLOR.green)
    .setTitle(`📦 Commande — ${clamp(entreprise, 64)}`)
    .setDescription(
      [
        `📅 **Semaine : ${weekKey}**`,
        `✅ **Statut : TRAITÉ & LIVRÉ**`,
        "",
        `🏢 **Entreprise :** ${entreprise}`,
        `📍 **Lieu :** ${lieu}`,
        contactLine,
      ].join("\n")
    )
    .addFields(
      {
        name: "📄 Détails",
        value: bullet([
          fmtLine("Article", article),
          fmtLine("Quantité", qty),
          `—`,
          fmtLine("Montant", money(montant)),
        ]),
        inline: false,
      }
    )
    .setFooter({ text: `Commandes • ${weekKey}` })
    .setTimestamp(new Date());

  const icon = botIconUrl();
  if (icon) embed.setAuthor({ name: "Le Secrétaire — Commandes", iconURL: icon });

  return embed;
}

/* ===== RACHAT EMPLOYÉ (objet + quantité) ===== */
function buildRachatEmployeEmbedPremium(weekKey, obj) {
  const name = pick(obj, ["Prénom et nom", "Employé", "Employe", "Nom"], "—");

  const item = pick(
    obj,
    [
      "Objet racheté",
      "Objet rachete",
      "Objet",
      "Item",
      "Produit",
      "Article",
      "Libellé",
      "Libelle",
      "Désignation",
      "Designation",
      "Objet / Item",
      "Objet / Produit",
      "Produit racheté",
      "Produit rachete",
      "Article racheté",
      "Article rachete",
    ],
    "—"
  );

  const qty = pick(
    obj,
    [
      "Quantité",
      "Qté",
      "Qte",
      "Nombre",
      "Nb",
      "Quantité rachetée",
      "Quantite rachetee",
      "Qté rachetée",
      "Qte rachetee",
      "Quantité totale",
      "Quantite totale",
      "Qté totale",
      "Qte totale",
    ],
    "—"
  );

  const montant = pick(
    obj,
    ["Montant", "Prix", "Total", "Montant total", "Montant rachat"],
    "—"
  );
  const note = pick(obj, ["Note", "Commentaire", "Motif"], "");

  const embed = new EmbedBuilder()
    .setColor(COLOR.yellow)
    .setTitle(`🧾 Rachat employé — ${clamp(String(name), 64)}`)
    .setDescription(
      [
        `📅 **Semaine : ${weekKey}**`,
        `🧾 **Type : RACHAT DIRECT**`,
        "",
        `👤 **Employé :** ${name}`,
      ].join("\n")
    )
    .addFields({
      name: "📦 Détail",
      value: bullet([
        fmtLine("Objet", item),
        fmtLine("Quantité", qty),
        `—`,
        fmtLine("Montant", money(montant)),
      ]),
      inline: false,
    })
    .setFooter({ text: `Rachat employé • ${weekKey}` })
    .setTimestamp(new Date());

  if (note && String(note).trim() && note !== "—") {
    embed.addFields({
      name: "📝 Note",
      value: clamp(note, 1024),
      inline: false,
    });
  }

  const icon = botIconUrl();
  if (icon) embed.setAuthor({ name: "Le Secrétaire — Rachat employé", iconURL: icon });

  return embed;
}

/* ===== RACHAT TEMPORAIRE (vendu, objet + quantité) ===== */
function buildRachatTempEmbedPremium(weekKey, obj) {
  const name = pick(obj, ["Prénom et nom", "Employé", "Employe", "Nom"], "—");

  const item = pick(
    obj,
    [
      "Objet",
      "Item",
      "Produit",
      "Article",
      "Libellé",
      "Libelle",
      "Désignation",
      "Designation",
      "Objet vendu",
      "Item vendu",
      "Produit vendu",
      "Article vendu",
      "Produit (vendu)",
      "Article (vendu)",
    ],
    "—"
  );

  const qty = pick(
    obj,
    [
      "Quantité",
      "Qté",
      "Qte",
      "Nombre",
      "Nb",
      "Quantité vendue",
      "Quantite vendue",
      "Qté vendue",
      "Qte vendue",
      "Quantité totale",
      "Quantite totale",
      "Qté totale",
      "Qte totale",
    ],
    "—"
  );

  const montant = pick(obj, ["Montant", "Prix", "Total", "Montant total"], "—");
  const note = pick(obj, ["Note", "Commentaire", "Motif"], "");

  const embed = new EmbedBuilder()
    .setColor(COLOR.purple)
    .setTitle(`✅ Rachat temporaire — ${clamp(String(item), 64)}`)
    .setDescription(
      [
        `📅 **Semaine : ${weekKey}**`,
        `✅ **Statut : VENDU (sorti du stock)**`,
        "",
        `👤 **Employé :** ${name}`,
      ].join("\n")
    )
    .addFields({
      name: "📦 Détail",
      value: bullet([
        fmtLine("Objet", item),
        fmtLine("Quantité", qty),
        `—`,
        fmtLine("Montant", money(montant)),
      ]),
      inline: false,
    })
    .setFooter({ text: `Rachat temporaire • ${weekKey}` })
    .setTimestamp(new Date());

  if (note && String(note).trim() && note !== "—") {
    embed.addFields({
      name: "📝 Note",
      value: clamp(note, 1024),
      inline: false,
    });
  }

  const icon = botIconUrl();
  if (icon) embed.setAuthor({ name: "Le Secrétaire — Rachat temporaire", iconURL: icon });

  return embed;
}

/* ===================== WEEK SUMMARY EMBEDS (PREMIUM) ===================== */
function buildWeekSummaryEmbedSalaires(weekKey, locked, st) {
  const color = locked ? COLOR.gray : st.unpaid > 0 ? COLOR.yellow : COLOR.green;
  const badge = locked
    ? "🔒 **VERROUILLÉE**"
    : st.unpaid > 0
    ? "🟡 **EN ATTENTE**"
    : "🟢 **OK**";

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📌 Résumé Salaires — ${weekKey}`)
    .setDescription(
      [
        `📅 **Semaine : ${weekKey}**`,
        `📌 État : ${badge}`,
        "",
        bigTotalPaid(st.totalPaid),
      ].join("\n")
    )
    .addFields(
      {
        name: "👥 Statuts",
        value: bullet([
          fmtLine("Employés", st.count),
          fmtLine("✅ Payé", st.paid),
          fmtLine("❌ Pas payé", st.unpaid),
        ]),
        inline: true,
      },
      {
        name: "💰 Détails",
        value: bullet([
          fmtLine("Total salaires", money(st.totalSalaire)),
          fmtLine("Total primes", money(st.totalPrime)),
          fmtLine("Montant rachats", money(st.totalRachatMontant)),
        ]),
        inline: true,
      },
      {
        name: "🪵 Production",
        value: bullet([fmtLine("Quantité totale", safeMoney(st.totalProd))]),
        inline: true,
      }
    )
    .setFooter({ text: `Résumé • ${weekKey}` })
    .setTimestamp(new Date());

  const icon = botIconUrl();
  if (icon) embed.setAuthor({ name: "Le Secrétaire — Résumé", iconURL: icon });

  return embed;
}

function buildWeekSummaryEmbedCommandes(weekKey, st) {
  const color = st.count === 0 ? COLOR.gray : COLOR.green;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📌 Résumé Commandes — ${weekKey}`)
    .setDescription(
      [
        `📅 **Semaine : ${weekKey}**`,
        `✅ **Statut global : TRAITÉ & LIVRÉ**`,
        "",
        `📦 **Commandes : ${st.count}**`,
        `💰 **Total : ${money(st.total)}**`,
      ].join("\n")
    )
    .setFooter({ text: `Résumé • ${weekKey}` })
    .setTimestamp(new Date());

  if (st.count === 0) {
    embed.addFields({
      name: "ℹ️ Info",
      value: "Aucune commande traitée cette semaine.",
      inline: false,
    });
  }

  const icon = botIconUrl();
  if (icon) embed.setAuthor({ name: "Le Secrétaire — Résumé", iconURL: icon });

  return embed;
}

function buildWeekSummaryEmbedRachat(kindLabel, weekKey, st, baseColor, subtitle) {
  const color = st.count === 0 ? COLOR.gray : baseColor;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📌 Résumé ${kindLabel} — ${weekKey}`)
    .setDescription(
      [
        `📅 **Semaine : ${weekKey}**`,
        subtitle ? `${subtitle}` : "",
        "",
        `📦 **Entrées : ${st.count}**`,
        `💰 **Total : ${money(st.total)}**`,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .setFooter({ text: `Résumé • ${weekKey}` })
    .setTimestamp(new Date());

  if (st.count === 0) {
    embed.addFields({
      name: "ℹ️ Info",
      value: "Aucune entrée cette semaine.",
      inline: false,
    });
  }

  const icon = botIconUrl();
  if (icon) embed.setAuthor({ name: "Le Secrétaire — Résumé", iconURL: icon });

  return embed;
}

/* ===================== SALAIRES: refresh résumé seulement ===================== */
async function refreshSalairesSummaryOnly(sheets, weekKey) {
  const locked = await isWeekLocked(sheets, weekKey);
  const parsed = await getParsedCached(sheets, SHEET_SALAIRES);
  const st = computeSalairesStatusFromParsed(parsed, weekKey);

  const sumEmbed = buildWeekSummaryEmbedSalaires(weekKey, locked, st);
  const sumHash = sha({ kind: "salaires", week: weekKey, locked, st });

  await upsertWeekSummaryMessage({
    sheets,
    kind: "salaires",
    weekKey,
    channelId: SALAIRES_CHANNEL_ID,
    embed: sumEmbed,
    hash: sumHash,
    force: true,
  });
}

/* ===================== SALAIRES: refresh UN SEUL message (ultra rapide) ===================== */
async function refreshSalaireOneFast({ sheets, weekKey, employeName, messageId, ignoreLock = false }) {
  const stateRows = await readStateRowsSalairesCached(sheets);
  const data = stateRows.slice(1);

  let stRow = null;
  let stIndex = -1;

  const targetNorm = employeName ? normName(employeName) : null;

  for (let i = 0; i < data.length; i++) {
    const r = data[i] || [];
    const mid = String(r[6] || "");
    const w = String(r[1] || "");
    const n = String(r[2] || "");
    if (messageId && mid === String(messageId)) {
      stRow = r;
      stIndex = i;
      break;
    }
    if (!messageId && w === String(weekKey) && targetNorm && normName(n) === targetNorm) {
      stRow = r;
      stIndex = i;
      break;
    }
  }

  if (!stRow) return { ok: false, reason: "state_not_found" };

  const locked = boolLocked(stRow[7]);
  if (locked && !ignoreLock) return { ok: false, reason: "locked" };

  const sheetRow = Number(stRow[9] || 0);

  let obj = null;
  if (sheetRow > 0) {
    obj = await readRowObject(sheets, SHEET_SALAIRES, sheetRow);
  } else {
    const parsed = await getParsedCached(sheets, SHEET_SALAIRES);
    const rec = parsed.records.find(
      (rr) =>
        rr.week === weekKey &&
        normName(rr.obj["Prénom et nom"]) === normName(stRow[2])
    );
    obj = rec?.obj || {};
  }

  const ch = await resolveTextChannel(SALAIRES_CHANNEL_ID);
  if (!ch) return { ok: false, reason: "channel_missing" };

  const msgId = String(stRow[6] || messageId || "");
  if (!msgId) return { ok: false, reason: "message_missing" };

  const linksMap = await getLinksMapCached(sheets);
  const mentionId = linksMap.get(normName(stRow[2]));
  const mention = mentionId ? `<@${mentionId}>` : "";

  // ✅ IMPORTANT : on rebuild l'embed COMPLET (ça évite tout “V/X” qui casse le rendu)
  const embed = buildSalaireEmbedPremium(weekKey, obj);
  const newHash = sha({ week: weekKey, obj });

  try {
    const msg = await ch.messages.fetch(msgId);
    await msg.edit({
      content: mention,
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
    await discordDelay();
  } catch {
    return { ok: false, reason: "discord_fetch_or_edit_failed" };
  }

  const rowNum = stIndex + 2;
  const updatedRow = [...stRow];
  updatedRow[8] = newHash;
  updatedRow[9] = String(sheetRow || updatedRow[9] || "");

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_BOT_STATE_SALAIRES}!A${rowNum}:J${rowNum}`,
    valueInputOption: "RAW",
    requestBody: { values: [updatedRow] },
  });

  invalidateStateCache(SHEET_BOT_STATE_SALAIRES);
  return { ok: true };
}

/* ===================== SYNC: SALAIRES (Résumé + Unitaires) ===================== */
async function syncSalairesWeek(weekKey, { force = false, ignoreLockForUnitaires = false } = {}) {
  const sheets = await getSheets();
  await ensureStateSheetSalaires(sheets);

  if (!SALAIRES_CHANNEL_ID) throw new Error("SALAIRES_CHANNEL_ID manquant.");
  const ch = await resolveTextChannel(SALAIRES_CHANNEL_ID);
  if (!ch) throw new Error("Salon salaires invalide.");

  const locked = await isWeekLocked(sheets, weekKey);

  // ✅ Résumé
  const parsed = await getParsedCached(sheets, SHEET_SALAIRES);
  const stSum = computeSalairesStatusFromParsed(parsed, weekKey);
  const sumEmbed = buildWeekSummaryEmbedSalaires(weekKey, locked, stSum);
  const sumHash = sha({ kind: "salaires", week: weekKey, locked, stSum });
  await upsertWeekSummaryMessage({
    sheets,
    kind: "salaires",
    weekKey,
    channelId: SALAIRES_CHANNEL_ID,
    embed: sumEmbed,
    hash: sumHash,
    force,
  });

  // 🔒 lock => normalement on ne touche pas unitaires,
  // mais en rebuild on veut pouvoir reposter => ignoreLockForUnitaires=true
  if (locked && !ignoreLockForUnitaires) {
    return { locked: true, created: 0, edited: 0, skipped: 0 };
  }

  const weekRecords = parsed.records
    .filter((r) => r.week === weekKey)
    .filter((r) => String(r.obj["Prénom et nom"] || "").trim() !== "");

  const linksMap = await getLinksMapCached(sheets);

  const stateRows = await readStateRowsSalairesCached(sheets);
  const header = stateRows[0] || SALAIRES_STATE_HEADER;
  const data = stateRows.slice(1);

  const map = new Map();
  for (let i = 0; i < data.length; i++) {
    const row = data[i] || [];
    const k = String(row[0] || "");
    if (k) map.set(k, { i, row });
  }

  let created = 0,
    edited = 0,
    skipped = 0;

  for (const rec of weekRecords) {
    const employeName = String(rec.obj["Prénom et nom"] || "").trim();
    const key = `${weekKey}::${normName(employeName)}`;
    const newHash = sha({ week: weekKey, obj: rec.obj });

    const st = map.get(key);
    const oldMsgId = st?.row?.[6] ? String(st.row[6]) : "";
    const oldLocked = st?.row?.[7];
    const oldHash = st?.row?.[8] ? String(st.row[8]) : "";

    // si la ligne a été lockée au niveau salarié, on respecte (même en force)
    if (boolLocked(oldLocked) && !ignoreLockForUnitaires) {
      skipped++;
      continue;
    }

    if (!force && oldMsgId && oldHash === newHash) {
      skipped++;
      continue;
    }

    const discordUserId = linksMap.get(normName(employeName));
    const mention = discordUserId ? `<@${discordUserId}>` : "";
    const embed = buildSalaireEmbedPremium(weekKey, rec.obj);

    // EDIT
    if (oldMsgId) {
      try {
        const msg = await ch.messages.fetch(oldMsgId);
        await msg.edit({
          content: mention,
          embeds: [embed],
          allowedMentions: { parse: [] },
        });
        await discordDelay();
        edited++;

        const row = st.row;
        row[0] = key;
        row[1] = weekKey;
        row[2] = employeName;
        row[3] = String(rec.obj["Grade"] || "");
        row[4] = String(rec.obj["Télégramme"] || "");
        row[5] = SALAIRES_CHANNEL_ID;
        row[6] = oldMsgId;
        row[7] = ignoreLockForUnitaires ? "true" : ""; // si week lock/rebuild, on garde lock actif
        row[8] = newHash;
        row[9] = String(rec.rowIndex);
        continue;
      } catch {
        // message supprimé -> create
      }
    }

    // CREATE => ping
    const msg = await ch.send({
      content: mention,
      embeds: [embed],
      allowedMentions: discordUserId ? { users: [discordUserId] } : { parse: [] },
    });
    await discordDelay();
    created++;

    if (st) {
      const row = st.row;
      row[0] = key;
      row[1] = weekKey;
      row[2] = employeName;
      row[3] = String(rec.obj["Grade"] || "");
      row[4] = String(rec.obj["Télégramme"] || "");
      row[5] = SALAIRES_CHANNEL_ID;
      row[6] = msg.id;
      row[7] = ignoreLockForUnitaires ? "true" : "";
      row[8] = newHash;
      row[9] = String(rec.rowIndex);
    } else {
      data.push([
        key,
        weekKey,
        employeName,
        String(rec.obj["Grade"] || ""),
        String(rec.obj["Télégramme"] || ""),
        SALAIRES_CHANNEL_ID,
        msg.id,
        ignoreLockForUnitaires ? "true" : "",
        newHash,
        String(rec.rowIndex),
      ]);
    }
  }

  const newState = [header.length ? header : SALAIRES_STATE_HEADER, ...data];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_BOT_STATE_SALAIRES}!A1:J${newState.length}`,
    valueInputOption: "RAW",
    requestBody: { values: newState },
  });

  invalidateStateCache(SHEET_BOT_STATE_SALAIRES);

  return { locked: false, created, edited, skipped };
}

/* ===================== SYNC: GENERIC (Commandes / Rachats) + Résumé ===================== */
async function syncHistoryWeek({
  weekKey,
  sheetName,
  stateSheet,
  channelId,
  kind,
  force = false,
}) {
  const sheets = await getSheets();
  await ensureStateSheet(sheets, stateSheet);

  if (!channelId) throw new Error(`${kind}: channelId manquant.`);
  const ch = await resolveTextChannel(channelId);
  if (!ch) throw new Error(`${kind}: salon invalide.`);

  const parsed = await getParsedCached(sheets, sheetName);

  // ✅ Résumé
  if (kind === "Commandes") {
    const st = computeCommandesStatusFromParsed(parsed, weekKey);
    const embed = buildWeekSummaryEmbedCommandes(weekKey, st);
    await upsertWeekSummaryMessage({
      sheets,
      kind: "commandes",
      weekKey,
      channelId,
      embed,
      hash: sha({ kind: "commandes", week: weekKey, st }),
      force,
    });
  } else if (kind === "Rachat employé") {
    const st = computeGenericRachatStatsFromParsed(parsed, weekKey);
    const embed = buildWeekSummaryEmbedRachat(
      "Rachat employé",
      weekKey,
      st,
      COLOR.yellow,
      "🧾 Rachat direct"
    );
    await upsertWeekSummaryMessage({
      sheets,
      kind: "rachat_employe",
      weekKey,
      channelId,
      embed,
      hash: sha({ kind: "rachat_employe", week: weekKey, st }),
      force,
    });
  } else if (kind === "Rachat temporaire") {
    const st = computeGenericRachatStatsFromParsed(parsed, weekKey);
    const embed = buildWeekSummaryEmbedRachat(
      "Rachat temporaire",
      weekKey,
      st,
      COLOR.purple,
      "✅ Vendu (sorti du stock)"
    );
    await upsertWeekSummaryMessage({
      sheets,
      kind: "rachat_temp",
      weekKey,
      channelId,
      embed,
      hash: sha({ kind: "rachat_temp", week: weekKey, st }),
      force,
    });
  }

  // ✅ Unitaires
  const weekRecords = parsed.records.filter((r) => r.week === weekKey);

  const stateRows = await readStateRowsCached(sheets, stateSheet);
  const header = stateRows[0] || [];
  const data = stateRows.slice(1);

  const map = new Map();
  for (let i = 0; i < data.length; i++) {
    const row = data[i] || [];
    const k = String(row[0] || "");
    if (k) map.set(k, { i, row });
  }

  let created = 0,
    edited = 0,
    skipped = 0;

  for (const rec of weekRecords) {
    const hasAny = Object.values(rec.obj || {}).some(
      (v) => String(v ?? "").trim() !== ""
    );
    if (!hasAny) continue;

    const key = `${weekKey}::${sheetName}::row${rec.rowIndex}`;
    const newHash = sha({ week: weekKey, obj: rec.obj });

    const st = map.get(key);
    const oldMsgId = st?.row?.[4] ? String(st.row[4]) : "";
    const oldLocked = st?.row?.[5];
    const oldHash = st?.row?.[6] ? String(st.row[6]) : "";

    if (boolLocked(oldLocked)) {
      skipped++;
      continue;
    }
    if (!force && oldMsgId && oldHash === newHash) {
      skipped++;
      continue;
    }

    let embed;
    if (kind === "Commandes") embed = buildCommandeEmbedPremium(weekKey, rec.obj);
    else if (kind === "Rachat employé")
      embed = buildRachatEmployeEmbedPremium(weekKey, rec.obj);
    else if (kind === "Rachat temporaire")
      embed = buildRachatTempEmbedPremium(weekKey, rec.obj);
    else embed = new EmbedBuilder().setColor(COLOR.gray).setTitle(kind);

    if (oldMsgId) {
      try {
        const msg = await ch.messages.fetch(oldMsgId);
        await msg.edit({ embeds: [embed] });
        await discordDelay();
        edited++;

        const row = st.row;
        row[0] = key;
        row[1] = weekKey;
        row[2] = String(
          pick(
            rec.obj,
            ["Client", "Entreprise", "Prénom et nom", "Nom", "Libellé", "Objet", "Article", "Produit"],
            `${kind} ${rec.rowIndex}`
          )
        );
        row[3] = channelId;
        row[4] = oldMsgId;
        row[5] = "";
        row[6] = newHash;
        continue;
      } catch {
        // message supprimé -> create
      }
    }

    const msg = await ch.send({ embeds: [embed] });
    await discordDelay();
    created++;

    if (st) {
      const row = st.row;
      row[0] = key;
      row[1] = weekKey;
      row[2] = String(
        pick(
          rec.obj,
          ["Client", "Entreprise", "Prénom et nom", "Nom", "Libellé", "Objet", "Article", "Produit"],
          `${kind} ${rec.rowIndex}`
        )
      );
      row[3] = channelId;
      row[4] = msg.id;
      row[5] = "";
      row[6] = newHash;
    } else {
      data.push([
        key,
        weekKey,
        String(
          pick(
            rec.obj,
            ["Client", "Entreprise", "Prénom et nom", "Nom", "Libellé", "Objet", "Article", "Produit"],
            `${kind} ${rec.rowIndex}`
          )
        ),
        channelId,
        msg.id,
        "",
        newHash,
      ]);
    }
  }

  const newState = [
    header.length
      ? header
      : ["key", "week", "name", "channelId", "messageId", "locked", "hash"],
    ...data,
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${stateSheet}!A1:G${newState.length}`,
    valueInputOption: "RAW",
    requestBody: { values: newState },
  });

  invalidateStateCache(stateSheet);

  return { created, edited, skipped };
}

/* ===================== AUTOCOMPLETE DATA ===================== */
async function getWeeksUnionCached(sheets) {
  const key = `weeksUnion`;
  const hit = FAST_MODE ? cacheGet(key) : null;
  if (hit) return hit;

  const [pSal, pCmd, pRE, pRT] = await Promise.all([
    getParsedCached(sheets, SHEET_SALAIRES),
    getParsedCached(sheets, SHEET_COMMANDES),
    getParsedCached(sheets, SHEET_RACHAT_EMPLOYE),
    getParsedCached(sheets, SHEET_RACHAT_TEMP),
  ]);

  const weeks = [];
  for (const r of pSal.records) weeks.push(r.week);
  for (const r of pCmd.records) weeks.push(r.week);
  for (const r of pRE.records) weeks.push(r.week);
  for (const r of pRT.records) weeks.push(r.week);

  return cacheSet(key, sortWeeksDesc(weeks), CACHE_TTL_SECONDS);
}
async function getEmployeesForWeekCached(sheets, weekKey) {
  const key = `emps::${weekKey}`;
  const hit = FAST_MODE ? cacheGet(key) : null;
  if (hit) return hit;

  const parsed = await getParsedCached(sheets, SHEET_SALAIRES);
  const emps = parsed.records
    .filter((r) => r.week === weekKey)
    .map((r) => String(r.obj["Prénom et nom"] || "").trim())
    .filter(Boolean);

  return cacheSet(key, emps, CACHE_TTL_SECONDS);
}

/* ===================== AUTOCOMPLETE HANDLER ===================== */
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isAutocomplete()) return;

  const startedAt = Date.now();
  const tooLate = () => Date.now() - startedAt > 2500;

  try {
    const sheets = await getSheets();
    const focused = interaction.options.getFocused(true);

    if (focused.name === "semaine") {
      if (tooLate()) return;
      const weeks = await getWeeksUnionCached(sheets);
      if (tooLate()) return;
      await interaction.respond(filterChoices(weeks, focused.value)).catch((err) => {
        if (err?.code === 10062) return;
      });
      return;
    }

    if (focused.name === "employe") {
      const weekKey = interaction.options.getString("semaine");
      if (!weekKey) return interaction.respond([]).catch(() => {});
      if (tooLate()) return;

      const emps = await getEmployeesForWeekCached(sheets, weekKey);
      if (tooLate()) return;

      await interaction.respond(filterChoices(emps, focused.value)).catch((err) => {
        if (err?.code === 10062) return;
      });
      return;
    }

    await interaction.respond([]).catch(() => {});
  } catch {
    try {
      await interaction.respond([]);
    } catch {}
  }
});

/* ===================== COMMANDES HANDLER ===================== */
client.on(Events.InteractionCreate, async (interaction) => {
  // PART2: laisse Part2 gérer ses commandes (et plus tard: modals/buttons)
  try {
    if (await handlePart2Interaction(interaction)) return;
  } catch (e) {
    console.error("[part2] handle interaction error:", e);
  }

  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;

  try {
    const protectedCommands = new Set([
      "syncsalaires",
      "salairesstatus",
      "pay",
      "unpay",
      "payuser",
      "unpayuser",
      "lock",
      "unlock",
      "synccommandes",
      "commandesstatus",
      "syncrachatemploye",
      "syncrachattemp",
      "syncrachatemporaire",
      "syncall",
      "publish",
"rebuildsalaires",
      "rebuildcommandes",
      "rebuildrachatemploye",
      "rebuildrachattemp",
      "rebuildall",
    ]);

    if (protectedCommands.has(cmd) && !hasPayRole(interaction.member)) {
      await logEvent("warn", "auth", `/${cmd}`, "Permission refusée", {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });
      return interaction.reply({
        content: "⛔ Tu n’as pas la permission.",
        flags: MessageFlagsBitField.Flags.Ephemeral,
      });
    }

    const sheets = await getSheets();

    /* ===== LINKS ===== */
    if (cmd === "link") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const user = interaction.options.getUser("user");
      const employeName = interaction.options.getString("nom");
      const telegramme = interaction.options.getString("telegramme") || "";
      const active = interaction.options.getBoolean("active");
      const isActive = active === null ? true : active;

      const result = await upsertLink(sheets, {
        telegramme,
        employeName,
        discordUserId: user.id,
        active: isActive,
      });

      await logEvent(
        "info",
        "links",
        "link",
        `Lien ${result.action}: ${employeName} <-> ${user.id}`,
        {
          actorTag: interaction.user?.tag,
          actorId: interaction.user?.id,
          target: `${employeName} | <@${user.id}>`,
        }
      );

      return interaction.editReply(
        `✅ Lien ${result.action}.\nDiscord: <@${user.id}>\nEmployé: **${employeName}**\nTélégramme: **${
          telegramme || "—"
        }**\nActif: **${isActive ? "true" : "false"}**`
      );
    }

    if (cmd === "unlink") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const user = interaction.options.getUser("user");
      const result = await deactivateLink(sheets, user.id);

      await logEvent("info", "links", "unlink", `Action=${result.action}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        target: `<@${user.id}>`,
      });

      return interaction.editReply(
        result.action === "disabled"
          ? `✅ Lien désactivé pour <@${user.id}>.`
          : `⚠️ Aucun lien trouvé pour <@${user.id}>.`
      );
    }

    if (cmd === "dellink") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const user = interaction.options.getUser("user");
      const result = await deleteLinkRow(sheets, user.id);

      await logEvent("info", "links", "dellink", `Action=${result.action}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        target: `<@${user.id}>`,
      });

      if (result.action === "deleted")
        return interaction.editReply(
          `🗑️ Ligne supprimée dans BOT_LINKS pour <@${user.id}>.`
        );
      if (result.action === "not_found")
        return interaction.editReply(
          `⚠️ Aucune ligne BOT_LINKS trouvée pour <@${user.id}>.`
        );
      return interaction.editReply("⚠️ Impossible (onglet BOT_LINKS introuvable).");
    }

    /* ===== STATUS SALAIRES ===== */
    if (cmd === "salairesstatus") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const semaine = interaction.options.getString("semaine");
      const locked = await isWeekLocked(sheets, semaine);
      const parsed = await getParsedCached(sheets, SHEET_SALAIRES);
      const st = computeSalairesStatusFromParsed(parsed, semaine);

      await logEvent(
        "info",
        "salaires",
        "status",
        `week=${semaine} locked=${locked} paid=${st.paid} unpaid=${st.unpaid} totalPaid=${money(
          st.totalPaid
        )}`,
        {
          actorTag: interaction.user?.tag,
          actorId: interaction.user?.id,
          week: semaine,
        }
      );

      return interaction.editReply(
        `📌 **${semaine}**\n` +
          `🔒 Lock: **${locked ? "OUI" : "NON"}**\n` +
          `👥 Employés: **${st.count}** | ✅ Payé: **${st.paid}** | ❌ Pas payé: **${st.unpaid}**\n` +
          `💵 **TOTAL PAYÉ: ${money(st.totalPaid)}**`
      );
    }

    /* ===== STATUS COMMANDES ===== */
    if (cmd === "commandesstatus") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const semaine = interaction.options.getString("semaine");
      const parsed = await getParsedCached(sheets, SHEET_COMMANDES);
      const st = computeCommandesStatusFromParsed(parsed, semaine);

      await logEvent("info", "commandes", "status", `week=${semaine} count=${st.count} total=${money(st.total)}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        week: semaine,
      });

      return interaction.editReply(
        `📦 **Commandes — ${semaine}**\n` +
          `✅ Statut global: **Traité & livré**\n` +
          `📌 Nombre: **${st.count}**\n` +
          `💰 Total: **${money(st.total)}**`
      );
    }

    /* ===== LOCK / UNLOCK ===== */
    if (cmd === "lock" || cmd === "unlock") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const semaine = interaction.options.getString("semaine");
      const changed = await lockWeek(sheets, semaine, cmd === "lock");

      await logEvent("info", "salaires", cmd, `${semaine} -> ${cmd.toUpperCase()} (${changed} lignes)`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        week: semaine,
      });

      await refreshSalairesSummaryOnly(sheets, semaine).catch(() => {});
      return interaction.editReply(
        cmd === "lock"
          ? `✅ Semaine **${semaine}** verrouillée (${changed} lignes).`
          : `✅ Semaine **${semaine}** déverrouillée (${changed} lignes).`
      );
    }

    /* ===== PAY / UNPAY (ULTRA RAPIDE) ===== */
    if (cmd === "pay" || cmd === "unpay") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const semaine = interaction.options.getString("semaine");
      const employe = interaction.options.getString("employe");
      const newStatus = cmd === "pay" ? "Payé" : "Pas payé";

      if (await isWeekLocked(sheets, semaine)) {
        return interaction.editReply(`⛔ La semaine **${semaine}** est verrouillée.`);
      }

      const ok = await updateSalaireStatusFast(sheets, semaine, employe, newStatus);
      if (!ok) return interaction.editReply(`❌ Employé introuvable pour **${semaine}** : "${employe}"`);

      await refreshSalaireOneFast({ sheets, weekKey: semaine, employeName: employe }).catch(() => {});
      await refreshSalairesSummaryOnly(sheets, semaine).catch(() => {});

      await logEvent("info", "salaires", cmd, `${employe} => ${newStatus}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        week: semaine,
        target: employe,
      });

      return interaction.editReply(`✅ **${employe}** → **${newStatus}** (compta + embed mis à jour)`);
    }

    /* ===== PAYUSER / UNPAYUSER (ULTRA RAPIDE) ===== */
    if (cmd === "payuser" || cmd === "unpayuser") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const semaine = interaction.options.getString("semaine");
      const user = interaction.options.getUser("user");
      const newStatus = cmd === "payuser" ? "Payé" : "Pas payé";

      if (await isWeekLocked(sheets, semaine)) {
        return interaction.editReply(`⛔ La semaine **${semaine}** est verrouillée.`);
      }

      const employeName = await getEmployeNameByDiscordId(sheets, user.id);
      if (!employeName)
        return interaction.editReply(`❌ Aucun lien actif BOT_LINKS pour <@${user.id}>. Fais d’abord /link.`);

      const ok = await updateSalaireStatusFast(sheets, semaine, employeName, newStatus);
      if (!ok) return interaction.editReply(`❌ Employé introuvable dans Historique salaires: "${employeName}"`);

      await refreshSalaireOneFast({ sheets, weekKey: semaine, employeName }).catch(() => {});
      await refreshSalairesSummaryOnly(sheets, semaine).catch(() => {});

      await logEvent("info", "salaires", cmd, `<@${user.id}> (${employeName}) => ${newStatus}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        week: semaine,
        target: `<@${user.id}> | ${employeName}`,
      });

      return interaction.editReply(`✅ <@${user.id}> (**${employeName}**) → **${newStatus}** (compta + embed mis à jour)`);
    }

    /* ===== SYNC SALAIRES ===== */
    if (cmd === "syncsalaires") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const semaine = interaction.options.getString("semaine");

      const out = await syncSalairesWeek(semaine, { force: false });
      if (out.locked)
        return interaction.editReply(`🔒 Semaine **${semaine}** verrouillée (résumé OK, unitaires inchangés).`);

      await logEvent("info", "salaires", "sync", `week=${semaine} c=${out.created} e=${out.edited} s=${out.skipped}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        week: semaine,
      });

      return interaction.editReply(`✅ Salaires **${semaine}** → created:${out.created} edited:${out.edited} skipped:${out.skipped}`);
    }

    /* ===== SYNC COMMANDES ===== */
    if (cmd === "synccommandes") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const semaine = interaction.options.getString("semaine");

      const out = await syncHistoryWeek({
        weekKey: semaine,
        sheetName: SHEET_COMMANDES,
        stateSheet: SHEET_BOT_STATE_COMMANDES,
        channelId: COMMANDES_CHANNEL_ID,
        kind: "Commandes",
        force: false,
      });

      await logEvent("info", "commandes", "sync", `week=${semaine} c=${out.created} e=${out.edited} s=${out.skipped}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        week: semaine,
      });

      return interaction.editReply(`✅ Commandes **${semaine}** → created:${out.created} edited:${out.edited} skipped:${out.skipped}`);
    }

    /* ===== SYNC RACHAT EMPLOYÉ ===== */
    if (cmd === "syncrachatemploye") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const semaine = interaction.options.getString("semaine");

      const out = await syncHistoryWeek({
        weekKey: semaine,
        sheetName: SHEET_RACHAT_EMPLOYE,
        stateSheet: SHEET_BOT_STATE_RACHAT_EMPLOYE,
        channelId: RACHAT_EMPLOYE_CHANNEL_ID,
        kind: "Rachat employé",
        force: false,
      });

      await logEvent("info", "rachat_employe", "sync", `week=${semaine} c=${out.created} e=${out.edited} s=${out.skipped}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        week: semaine,
      });

      return interaction.editReply(`✅ Rachat employé **${semaine}** → created:${out.created} edited:${out.edited} skipped:${out.skipped}`);
    }

    /* ===== SYNC RACHAT TEMPORAIRE ===== */
    if (cmd === "syncrachattemp" || cmd === "syncrachatemporaire") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const semaine = interaction.options.getString("semaine");

      const out = await syncHistoryWeek({
        weekKey: semaine,
        sheetName: SHEET_RACHAT_TEMP,
        stateSheet: SHEET_BOT_STATE_RACHAT_TEMP,
        channelId: RACHAT_TEMPORAIRE_CHANNEL_ID,
        kind: "Rachat temporaire",
        force: false,
      });

      await logEvent("info", "rachat_temp", "sync", `week=${semaine} c=${out.created} e=${out.edited} s=${out.skipped}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        week: semaine,
      });

      return interaction.editReply(`✅ Rachat temporaire **${semaine}** → created:${out.created} edited:${out.edited} skipped:${out.skipped}`);
    }

    /* ===== SYNC ALL ===== */
    if (cmd === "syncall") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const semaine = interaction.options.getString("semaine");

      const outSal = await syncSalairesWeek(semaine, { force: false }).catch((e) => ({ error: String(e?.message || e) }));
      const outCmd = await syncHistoryWeek({ weekKey: semaine, sheetName: SHEET_COMMANDES, stateSheet: SHEET_BOT_STATE_COMMANDES, channelId: COMMANDES_CHANNEL_ID, kind: "Commandes", force: false }).catch((e) => ({ error: String(e?.message || e) }));
      const outRE = await syncHistoryWeek({ weekKey: semaine, sheetName: SHEET_RACHAT_EMPLOYE, stateSheet: SHEET_BOT_STATE_RACHAT_EMPLOYE, channelId: RACHAT_EMPLOYE_CHANNEL_ID, kind: "Rachat employé", force: false }).catch((e) => ({ error: String(e?.message || e) }));
      const outRT = await syncHistoryWeek({ weekKey: semaine, sheetName: SHEET_RACHAT_TEMP, stateSheet: SHEET_BOT_STATE_RACHAT_TEMP, channelId: RACHAT_TEMPORAIRE_CHANNEL_ID, kind: "Rachat temporaire", force: false }).catch((e) => ({ error: String(e?.message || e) }));

      function fmt(label, out) {
        if (out?.error) return `- ${label}: ❌ ${out.error}`;
        if (out?.locked) return `- ${label}: 🔒 locked`;
        return `- ${label}: ✅ c=${out.created ?? 0} e=${out.edited ?? 0} s=${out.skipped ?? 0}`;
      }

      await logEvent("info", "sync", "syncall", `week=${semaine}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        week: semaine,
      });

      return interaction.editReply(
        `✅ SyncAll **${semaine}**\n` +
          `${fmt("Salaires", outSal)}\n` +
          `${fmt("Commandes", outCmd)}\n` +
          `${fmt("Rachat employé", outRE)}\n` +
          `${fmt("Rachat temp", outRT)}`
      );
    }

    /* ===== PUBLISH (résumé only pour rachats) ===== */
    if (cmd === "publish") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const type = interaction.options.getString("type");
      const semaine = interaction.options.getString("semaine");

      if (type === "rachat_employe") {
        const parsed = await getParsedCached(sheets, SHEET_RACHAT_EMPLOYE);
        const st = computeGenericRachatStatsFromParsed(parsed, semaine);
        const embed = buildWeekSummaryEmbedRachat("Rachat employé", semaine, st, COLOR.yellow, "🧾 Rachat direct");
        await upsertWeekSummaryMessage({
          sheets,
          kind: "rachat_employe",
          weekKey: semaine,
          channelId: RACHAT_EMPLOYE_CHANNEL_ID,
          embed,
          hash: sha({ kind: "rachat_employe", week: semaine, st }),
          force: true,
        });
        return interaction.editReply(`✅ Résumé publié/mis à jour (Rachat employé) — **${semaine}**`);
      }

      if (type === "rachat_temporaire") {
        const parsed = await getParsedCached(sheets, SHEET_RACHAT_TEMP);
        const st = computeGenericRachatStatsFromParsed(parsed, semaine);
        const embed = buildWeekSummaryEmbedRachat("Rachat temporaire", semaine, st, COLOR.purple, "✅ Vendu (sorti du stock)");
        await upsertWeekSummaryMessage({
          sheets,
          kind: "rachat_temp",
          weekKey: semaine,
          channelId: RACHAT_TEMPORAIRE_CHANNEL_ID,
          embed,
          hash: sha({ kind: "rachat_temp", week: semaine, st }),
          force: true,
        });
        return interaction.editReply(`✅ Résumé publié/mis à jour (Rachat temporaire) — **${semaine}**`);
      }

      return interaction.editReply("❌ Type invalide.");
    }

    /* ===================== REBUILD (force + purge) ===================== */
    async function deleteDiscordMessageSafe(channel, messageId) {
      try {
        const msg = await channel.messages.fetch(messageId);
        await msg.delete();
        await discordDelay();
        return true;
      } catch {
        return false;
      }
    }

    async function purgeWeekSummary(kindKey, weekKey, channelId) {
      await ensureWeekSummarySheet(sheets);

      const ch = await resolveTextChannel(channelId);
      if (!ch) return { deleted: 0, removed: 0 };

      const state = await readWeekSummaryStateCached(sheets);
      const header = state[0] || ["key", "week", "kind", "channelId", "messageId", "hash"];
      const rows = state.slice(1);

      const key = `SUMMARY::${kindKey}::${weekKey}`;
      let deleted = 0;

      const kept = [];
      for (const r of rows) {
        if (String(r?.[0] || "") !== key) {
          kept.push(r);
          continue;
        }
        const mid = r?.[4] ? String(r[4]) : "";
        if (mid && ch) {
          const ok = await deleteDiscordMessageSafe(ch, mid);
          if (ok) deleted++;
        }
      }

      await writeWeekSummaryState(sheets, [header, ...kept]);
      return { deleted, removed: rows.length - kept.length };
    }

    async function purgeWeekGenericState(stateSheet, channelId, weekKey) {
      await ensureStateSheet(sheets, stateSheet);

      const ch = await resolveTextChannel(channelId);
      if (!ch) throw new Error(`Salon introuvable: ${stateSheet}`);

      const rows = await readStateRowsCached(sheets, stateSheet);
      const header =
        rows[0] || ["key", "week", "name", "channelId", "messageId", "locked", "hash"];
      const data = rows.slice(1);

      let deleted = 0;
      const kept = [];

      for (const r of data) {
        if (String(r?.[1] || "") !== String(weekKey)) {
          kept.push(r);
          continue;
        }
        const mid = r?.[4] ? String(r[4]) : "";
        if (mid) {
          const ok = await deleteDiscordMessageSafe(ch, mid);
          if (ok) deleted++;
        }
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${stateSheet}!A1:G${kept.length + 1}`,
        valueInputOption: "RAW",
        requestBody: { values: [header, ...kept] },
      });

      invalidateStateCache(stateSheet);
      return { deleted, removed: data.length - kept.length };
    }

    async function purgeWeekSalairesState(weekKey) {
      await ensureStateSheetSalaires(sheets);

      const ch = await resolveTextChannel(SALAIRES_CHANNEL_ID);
      if (!ch) throw new Error(`Salon introuvable: salaires`);

      const rows = await readStateRowsSalairesCached(sheets);
      const header = rows[0] || SALAIRES_STATE_HEADER;
      const data = rows.slice(1);

      let deleted = 0;
      const kept = [];

      for (const r of data) {
        if (String(r?.[1] || "") !== String(weekKey)) {
          kept.push(r);
          continue;
        }
        const mid = r?.[6] ? String(r[6]) : "";
        if (mid) {
          const ok = await deleteDiscordMessageSafe(ch, mid);
          if (ok) deleted++;
        }
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_BOT_STATE_SALAIRES}!A1:J${kept.length + 1}`,
        valueInputOption: "RAW",
        requestBody: { values: [header, ...kept] },
      });

      invalidateStateCache(SHEET_BOT_STATE_SALAIRES);
      return { deleted, removed: data.length - kept.length };
    }

    async function rebuildAllWeekForce(weekKey) {
      const purges = {};

      purges.sumSal = await purgeWeekSummary("salaires", weekKey, SALAIRES_CHANNEL_ID);
      purges.sumCmd = await purgeWeekSummary("commandes", weekKey, COMMANDES_CHANNEL_ID);
      purges.sumRE = await purgeWeekSummary("rachat_employe", weekKey, RACHAT_EMPLOYE_CHANNEL_ID);
      purges.sumRT = await purgeWeekSummary("rachat_temp", weekKey, RACHAT_TEMPORAIRE_CHANNEL_ID);

      purges.sal = await purgeWeekSalairesState(weekKey);
      purges.cmd = await purgeWeekGenericState(SHEET_BOT_STATE_COMMANDES, COMMANDES_CHANNEL_ID, weekKey);
      purges.re = await purgeWeekGenericState(SHEET_BOT_STATE_RACHAT_EMPLOYE, RACHAT_EMPLOYE_CHANNEL_ID, weekKey);
      purges.rt = await purgeWeekGenericState(SHEET_BOT_STATE_RACHAT_TEMP, RACHAT_TEMPORAIRE_CHANNEL_ID, weekKey);

      invalidateSheetCache(SHEET_SALAIRES);
      invalidateSheetCache(SHEET_COMMANDES);
      invalidateSheetCache(SHEET_RACHAT_EMPLOYE);
      invalidateSheetCache(SHEET_RACHAT_TEMP);

      const ignoreLock = REBUILD_IGNORE_LOCK;

      const out = {};
      out.sal = await syncSalairesWeek(weekKey, { force: true, ignoreLockForUnitaires: ignoreLock });
      out.cmd = await syncHistoryWeek({
        weekKey,
        sheetName: SHEET_COMMANDES,
        stateSheet: SHEET_BOT_STATE_COMMANDES,
        channelId: COMMANDES_CHANNEL_ID,
        kind: "Commandes",
        force: true,
      });
      out.re = await syncHistoryWeek({
        weekKey,
        sheetName: SHEET_RACHAT_EMPLOYE,
        stateSheet: SHEET_BOT_STATE_RACHAT_EMPLOYE,
        channelId: RACHAT_EMPLOYE_CHANNEL_ID,
        kind: "Rachat employé",
        force: true,
      });
      out.rt = await syncHistoryWeek({
        weekKey,
        sheetName: SHEET_RACHAT_TEMP,
        stateSheet: SHEET_BOT_STATE_RACHAT_TEMP,
        channelId: RACHAT_TEMPORAIRE_CHANNEL_ID,
        kind: "Rachat temporaire",
        force: true,
      });

      return { purges, out };
    }

    if (cmd === "rebuildall") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const semaine = interaction.options.getString("semaine");

      const r = await rebuildAllWeekForce(semaine);

      await logEvent("info", "rebuild", "all_force", `week=${semaine}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        week: semaine,
      });

      return interaction.editReply(
        `✅ Rebuild ALL (force) **${semaine}**\n` +
          `🗑️ Purge unitaires: sal=${r.purges.sal.deleted} cmd=${r.purges.cmd.deleted} re=${r.purges.re.deleted} rt=${r.purges.rt.deleted}\n` +
          `📌 Repost: sal=c${r.out.sal.created}/e${r.out.sal.edited} cmd=c${r.out.cmd.created}/e${r.out.cmd.edited} re=c${r.out.re.created}/e${r.out.re.edited} rt=c${r.out.rt.created}/e${r.out.rt.edited}`
      );
    }

    if (cmd === "rebuildsalaires") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const semaine = interaction.options.getString("semaine");

      await purgeWeekSummary("salaires", semaine, SALAIRES_CHANNEL_ID);
      const pur = await purgeWeekSalairesState(semaine);
      invalidateSheetCache(SHEET_SALAIRES);
      const out = await syncSalairesWeek(semaine, { force: true, ignoreLockForUnitaires: REBUILD_IGNORE_LOCK });

      return interaction.editReply(
        `✅ Rebuild salaires **${semaine}**\n` +
          `🗑️ supprimés: ${pur.deleted} (state retiré: ${pur.removed})\n` +
          `📌 republié: created=${out.created} edited=${out.edited} skipped=${out.skipped} locked=${out.locked}`
      );
    }

    if (cmd === "rebuildcommandes") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const semaine = interaction.options.getString("semaine");

      await purgeWeekSummary("commandes", semaine, COMMANDES_CHANNEL_ID);
      const pur = await purgeWeekGenericState(
        SHEET_BOT_STATE_COMMANDES,
        COMMANDES_CHANNEL_ID,
        semaine
      );
      invalidateSheetCache(SHEET_COMMANDES);
      const out = await syncHistoryWeek({
        weekKey: semaine,
        sheetName: SHEET_COMMANDES,
        stateSheet: SHEET_BOT_STATE_COMMANDES,
        channelId: COMMANDES_CHANNEL_ID,
        kind: "Commandes",
        force: true,
      });

      return interaction.editReply(
        `✅ Rebuild commandes **${semaine}**\n` +
          `🗑️ supprimés: ${pur.deleted} (state retiré: ${pur.removed})\n` +
          `📌 republié: created=${out.created} edited=${out.edited} skipped=${out.skipped}`
      );
    }

    if (cmd === "rebuildrachatemploye") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const semaine = interaction.options.getString("semaine");

      await purgeWeekSummary("rachat_employe", semaine, RACHAT_EMPLOYE_CHANNEL_ID);
      const pur = await purgeWeekGenericState(
        SHEET_BOT_STATE_RACHAT_EMPLOYE,
        RACHAT_EMPLOYE_CHANNEL_ID,
        semaine
      );
      invalidateSheetCache(SHEET_RACHAT_EMPLOYE);
      const out = await syncHistoryWeek({
        weekKey: semaine,
        sheetName: SHEET_RACHAT_EMPLOYE,
        stateSheet: SHEET_BOT_STATE_RACHAT_EMPLOYE,
        channelId: RACHAT_EMPLOYE_CHANNEL_ID,
        kind: "Rachat employé",
        force: true,
      });

      return interaction.editReply(
        `✅ Rebuild rachat employé **${semaine}**\n` +
          `🗑️ supprimés: ${pur.deleted} (state retiré: ${pur.removed})\n` +
          `📌 republié: created=${out.created} edited=${out.edited} skipped=${out.skipped}`
      );
    }

    if (cmd === "rebuildrachattemp") {
      await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });
      const semaine = interaction.options.getString("semaine");

      await purgeWeekSummary("rachat_temp", semaine, RACHAT_TEMPORAIRE_CHANNEL_ID);
      const pur = await purgeWeekGenericState(
        SHEET_BOT_STATE_RACHAT_TEMP,
        RACHAT_TEMPORAIRE_CHANNEL_ID,
        semaine
      );
      invalidateSheetCache(SHEET_RACHAT_TEMP);
      const out = await syncHistoryWeek({
        weekKey: semaine,
        sheetName: SHEET_RACHAT_TEMP,
        stateSheet: SHEET_BOT_STATE_RACHAT_TEMP,
        channelId: RACHAT_TEMPORAIRE_CHANNEL_ID,
        kind: "Rachat temporaire",
        force: true,
      });

      return interaction.editReply(
        `✅ Rebuild rachat temporaire **${semaine}**\n` +
          `🗑️ supprimés: ${pur.deleted} (state retiré: ${pur.removed})\n` +
          `📌 republié: created=${out.created} edited=${out.edited} skipped=${out.skipped}`
      );
    }

    return interaction.reply({ content: "❓ Commande non gérée côté bot.js.", flags: MessageFlagsBitField.Flags.Ephemeral });
  } catch (e) {
    await logEvent("error", "command", `/${cmd}`, String(e?.stack || e || ""), {
      actorTag: interaction.user?.tag,
      actorId: interaction.user?.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
    });

    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content: `❌ Erreur: ${e?.message || e}` });
    }
    return interaction.reply({ content: `❌ Erreur: ${e?.message || e}`, flags: MessageFlagsBitField.Flags.Ephemeral });
  }
});

/* ===================== ✅/❌ REACTIONS SUR SALAIRES (ULTRA RAPIDE + RENDU SAFE) ===================== */
async function dmUserSafe(user, content) {
  try {
    await user.send(content);
  } catch {}
}

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    if (user.bot) return;

    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const emoji = reaction.emoji?.name;
    if (emoji !== "✅" && emoji !== "❌") return;

    const msg = reaction.message;
    if (!SALAIRES_CHANNEL_ID || msg.channelId !== SALAIRES_CHANNEL_ID) return;
    if (!msg.author || msg.author.id !== client.user.id) return;

    const guild = msg.guild;
    if (!guild) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!hasPayRole(member)) {
      await reaction.users.remove(user.id).catch(() => {});
      await dmUserSafe(user, "⛔ Tu n’as pas la permission d’utiliser ✅/❌ sur les salaires.");
      await logEvent("warn", "reaction", "denied", `emoji=${emoji}`, {
        actorTag: user.tag,
        actorId: user.id,
        guildId: guild.id,
        channelId: msg.channelId,
      });
      return;
    }

    const sheets = await getSheets();

    // Trouve semaine + employé via BOT_STATE (par messageId) => O(n) mais cache 8s
    const stateRows = await readStateRowsSalairesCached(sheets);
    const data = stateRows.slice(1);

    let weekKey = null;
    let employeName = null;

    for (const row of data) {
      const messageId = String(row?.[6] || "");
      if (messageId === msg.id) {
        weekKey = String(row?.[1] || "");
        employeName = String(row?.[2] || "");
        break;
      }
    }

    if (!weekKey || !employeName) {
      await reaction.users.remove(user.id).catch(() => {});
      await dmUserSafe(user, "⚠️ Impossible : BOT_STATE ne retrouve pas semaine/employé pour ce message.");
      await logEvent("warn", "reaction", "state_not_found", `messageId=${msg.id}`, {
        actorTag: user.tag,
        actorId: user.id,
        channelId: msg.channelId,
      });
      return;
    }

    if (await isWeekLocked(sheets, weekKey)) {
      await reaction.users.remove(user.id).catch(() => {});
      await dmUserSafe(user, `⛔ La semaine **${weekKey}** est verrouillée.`);
      await logEvent("info", "reaction", "locked", `week=${weekKey} ${employeName}`, {
        actorTag: user.tag,
        actorId: user.id,
        week: weekKey,
        target: employeName,
      });
      return;
    }

    const newStatus = emoji === "✅" ? "Payé" : "Pas payé";

    // update sheet statut (ULTRA FAST)
    const ok = await updateSalaireStatusFast(sheets, weekKey, employeName, newStatus);
    if (!ok) {
      await reaction.users.remove(user.id).catch(() => {});
      await dmUserSafe(user, `❌ Impossible de mettre à jour: employé introuvable dans **${weekKey}**.`);
      await logEvent("error", "reaction", "update_failed", `week=${weekKey} ${employeName}`, {
        actorTag: user.tag,
        actorId: user.id,
        week: weekKey,
        target: employeName,
      });
      return;
    }

    // ✅ IMPORTANT : on rebuild l'embed complet (aucun “V/X” texte)
    await refreshSalaireOneFast({ sheets, weekKey, employeName, messageId: msg.id }).catch(() => {});
    await refreshSalairesSummaryOnly(sheets, weekKey).catch(() => {});

    await logEvent("info", "reaction", "status_changed", `${employeName} => ${newStatus} (${weekKey})`, {
      actorTag: user.tag,
      actorId: user.id,
      week: weekKey,
      target: employeName,
    });

    await reaction.users.remove(user.id).catch(() => {});
    await dmUserSafe(user, `✅ OK : **${employeName}** est maintenant **${newStatus}** pour **${weekKey}**.`);
  } catch (e) {
    await logEvent("error", "reaction", "handler_error", String(e?.stack || e || ""));
  }
});

/* ===================== AUTOSYNC ===================== */
let _autoSyncRunning = false;
async function runAutoSyncOnce() {
  if (_autoSyncRunning) return;
  _autoSyncRunning = true;

  try {
    const sheets = await getSheets();
    const weeks = (await getWeeksUnionCached(sheets)).slice(
      0,
      Math.max(1, AUTO_SYNC_WEEKS_BACK)
    );

    if (AUTO_SYNC_LOG_RUNS) await logEvent("info", "autosync", "run", `Weeks: ${weeks.join(", ")}`);

    for (const w of weeks) {
      const outSal = await syncSalairesWeek(w, { force: false });
      if (AUTO_SYNC_LOG_RUNS) await logEvent("info", "autosync",
        "salaires",
        `week=${w} c=${outSal.created} e=${outSal.edited} s=${outSal.skipped} locked=${outSal.locked}`,
        { week: w }
      );

      const outCmd = await syncHistoryWeek({
        weekKey: w,
        sheetName: SHEET_COMMANDES,
        stateSheet: SHEET_BOT_STATE_COMMANDES,
        channelId: COMMANDES_CHANNEL_ID,
        kind: "Commandes",
        force: false,
      });
      if (AUTO_SYNC_LOG_RUNS) await logEvent("info", "autosync",
        "commandes",
        `week=${w} c=${outCmd.created} e=${outCmd.edited} s=${outCmd.skipped}`,
        { week: w }
      );

      const outRE = await syncHistoryWeek({
        weekKey: w,
        sheetName: SHEET_RACHAT_EMPLOYE,
        stateSheet: SHEET_BOT_STATE_RACHAT_EMPLOYE,
        channelId: RACHAT_EMPLOYE_CHANNEL_ID,
        kind: "Rachat employé",
        force: false,
      });
      if (AUTO_SYNC_LOG_RUNS) await logEvent("info", "autosync",
        "rachat_employe",
        `week=${w} c=${outRE.created} e=${outRE.edited} s=${outRE.skipped}`,
        { week: w }
      );

      const outRT = await syncHistoryWeek({
        weekKey: w,
        sheetName: SHEET_RACHAT_TEMP,
        stateSheet: SHEET_BOT_STATE_RACHAT_TEMP,
        channelId: RACHAT_TEMPORAIRE_CHANNEL_ID,
        kind: "Rachat temporaire",
        force: false,
      });
      if (AUTO_SYNC_LOG_RUNS) await logEvent("info", "autosync",
        "rachat_temp",
        `week=${w} c=${outRT.created} e=${outRT.edited} s=${outRT.skipped}`,
        { week: w }
      );
    }
  } catch (e) {
    await logEvent("error", "autosync", "run_error", String(e?.stack || e || ""));
  } finally {
    _autoSyncRunning = false;
  }
}

/* ===================== PROCESS SAFETY ===================== */
process.on("unhandledRejection", async (err) => {
  try {
    console.error("[unhandledRejection]", err);
    await logEvent("error", "process", "unhandledRejection", String(err?.stack || err || ""));
  } catch (e) {
    console.error("[unhandledRejection] logEvent failed:", e?.message || e);
  }
});

process.on("uncaughtException", async (err) => {
  try {
    console.error("[uncaughtException]", err);
    await logEvent("error", "process", "uncaughtException", String(err?.stack || err || ""));
  } catch (e) {
    console.error("[uncaughtException] logEvent failed:", e?.message || e);
  } finally {
    // laisse un peu de temps aux logs pour se flush
    setTimeout(() => process.exit(1), 500);
  }
});


/* ===================== READY ===================== */
client.once(Events.ClientReady, async () => {
  console.log("[PERF] FAST_MODE =", FAST_MODE);
  console.log("[PERF] CACHE_TTL_SECONDS =", CACHE_TTL_SECONDS);
  console.log("[PERF] MAX_ROWS_HISTORY =", MAX_ROWS_HISTORY);
  console.log("[PERF] DISCORD_OP_DELAY_MS =", DISCORD_OP_DELAY_MS);
  console.log("[PERF] HEADER_CACHE_TTL_SECONDS =", HEADER_CACHE_TTL_SECONDS);

  console.log("[AUTO] AUTO_SYNC =", process.env.AUTO_SYNC);
  console.log("[AUTO] AUTO_SYNC_INTERVAL_SECONDS =", process.env.AUTO_SYNC_INTERVAL_SECONDS);
  console.log("[AUTO] AUTO_SYNC_WEEKS_BACK =", process.env.AUTO_SYNC_WEEKS_BACK);
  console.log("[AUTO] AUTO_SYNC_ON_START =", process.env.AUTO_SYNC_ON_START);

  await logEvent("info", "bot", "startup", `✅ Bot prêt : ${client.user.tag}`);

  if (AUTO_SYNC) {
    if (AUTO_SYNC_LOG_RUNS) await logEvent("info", "autosync", "enabled", `interval=${AUTO_SYNC_INTERVAL_SECONDS}s weeksBack=${AUTO_SYNC_WEEKS_BACK}`);
    if (AUTO_SYNC_ON_START) runAutoSyncOnce().catch(() => {});
    setInterval(() => runAutoSyncOnce().catch(() => {}), AUTO_SYNC_INTERVAL_SECONDS * 1000);
  }
});

/* ===================== START ===================== */
client.login(DISCORD_TOKEN);
