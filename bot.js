require("dotenv").config();

const express = require("express");
const app = express();

app.get("/healthz", (req, res) => res.status(200).send("healthy"));

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`🌐 HTTP listening on ${PORT}`));

const crypto = require("crypto");
const { google } = require("googleapis");
const {
  Client,
  GatewayIntentBits,
  Events,
  Partials,
  EmbedBuilder,
} = require("discord.js");

// ===================== ENV =====================
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_KEYFILE = process.env.GOOGLE_KEYFILE;

const SALAIRES_CHANNEL_ID = process.env.SALAIRES_CHANNEL_ID || "";
const COMMANDES_CHANNEL_ID = process.env.COMMANDES_CHANNEL_ID || "";
const RACHAT_EMPLOYE_CHANNEL_ID = process.env.RACHAT_EMPLOYE_CHANNEL_ID || "";
const RACHAT_TEMPORAIRE_CHANNEL_ID = process.env.RACHAT_TEMPORAIRE_CHANNEL_ID || "";

const LOGS_CHANNEL_ID = process.env.LOGS_CHANNEL_ID || "";
const LOGS_TO_SHEETS = String(process.env.LOGS_TO_SHEETS || "false").toLowerCase() === "true";
const LOGS_SHEET = process.env.LOGS_SHEET || "Logs";
const LOGS_LEVEL = String(process.env.LOGS_LEVEL || "info").toLowerCase(); // info | debug

const PAY_ROLE_IDS = (process.env.PAY_ROLE_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!DISCORD_TOKEN || !SPREADSHEET_ID || !GOOGLE_KEYFILE) {
  console.error("❌ .env incomplet: DISCORD_TOKEN / SPREADSHEET_ID / GOOGLE_KEYFILE requis.");
  process.exit(1);
}

if (PAY_ROLE_IDS.length === 0) {
  console.warn("⚠️ PAY_ROLE_IDS est vide : toutes les commandes admin seront refusées.");
}

// ===================== SHEETS NAMES =====================
const LINKS_SHEET = "BOT_LINKS";

// historiques
const SALAIRES_SHEET = "Historique salaires";
const COMMANDES_SHEET = "Historique commandes";
const RACHAT_EMPLOYE_SHEET = "Historique rachat employé";
const RACHAT_TEMPORAIRE_SHEET = "Historique rachat temporaire";

// states
const BOT_STATE_SALAIRES = "BOT_STATE"; // déjà utilisé (lock + message ids salaires)
const BOT_STATE_COMMANDES = "BOT_STATE_COMMANDES";
const BOT_STATE_RACHAT_EMPLOYE = "BOT_STATE_RACHAT_EMPLOYE";
const BOT_STATE_RACHAT_TEMPORAIRE = "BOT_STATE_RACHAT_TEMPORAIRE";

// ===================== DISCORD CLIENT =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ===================== LOGGER =====================
const logQueue = [];
let logFlushRunning = false;

function shouldLog(level) {
  const order = { debug: 0, info: 1, warn: 2, error: 3 };
  const cur = order[LOGS_LEVEL] ?? 1;
  const lvl = order[level] ?? 1;
  return lvl >= cur;
}

async function ensureLogsSheet(sheets) {
  if (!LOGS_TO_SHEETS) return;

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const titles = (meta.data.sheets || []).map((s) => s.properties?.title);
  if (titles.includes(LOGS_SHEET)) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: LOGS_SHEET } } }] },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${LOGS_SHEET}!A1:K1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        "timestamp",
        "level",
        "source",
        "action",
        "week",
        "actorTag",
        "actorId",
        "guildId",
        "channelId",
        "target",
        "details"
      ]],
    },
  });
}

async function appendLogRowToSheets(sheets, payload) {
  if (!LOGS_TO_SHEETS) return;
  await ensureLogsSheet(sheets);

  const row = [
    payload.timestamp,
    payload.level,
    payload.source,
    payload.action,
    payload.week || "",
    payload.actorTag || "",
    payload.actorId || "",
    payload.guildId || "",
    payload.channelId || "",
    payload.target || "",
    payload.details || "",
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${LOGS_SHEET}!A:K`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

async function sendLogToDiscord(payload) {
  if (!LOGS_CHANNEL_ID) return;

  const ch = await client.channels.fetch(LOGS_CHANNEL_ID).catch(() => null);
  if (!ch || !ch.isTextBased?.()) return;

  const { EmbedBuilder } = require("discord.js");

  const embed = new EmbedBuilder()
    .setTitle(`${payload.level.toUpperCase()} • ${payload.action}`)
    .setDescription(payload.details ? String(payload.details).slice(0, 3500) : "—")
    .setTimestamp(new Date(payload.timestamp));

  const fields = [];
  if (payload.source) fields.push({ name: "Source", value: payload.source, inline: true });
  if (payload.week) fields.push({ name: "Semaine", value: payload.week, inline: true });
  if (payload.actorTag) fields.push({ name: "Auteur", value: `${payload.actorTag} (${payload.actorId})`, inline: false });
  if (payload.target) fields.push({ name: "Cible", value: String(payload.target).slice(0, 1024), inline: false });
  if (payload.guildId) fields.push({ name: "Guild", value: payload.guildId, inline: true });
  if (payload.channelId) fields.push({ name: "Channel", value: payload.channelId, inline: true });

  if (fields.length) embed.addFields(fields.slice(0, 25));

  await ch.send({ embeds: [embed] }).catch(() => {});
}

async function flushLogs() {
  if (logFlushRunning) return;
  logFlushRunning = true;

  try {
    const sheets = LOGS_TO_SHEETS ? await getSheets() : null;

    while (logQueue.length) {
      const payload = logQueue.shift();

      // discord
      await sendLogToDiscord(payload);

      // sheets
      if (LOGS_TO_SHEETS && sheets) {
        await appendLogRowToSheets(sheets, payload).catch(() => {});
      }
    }
  } finally {
    logFlushRunning = false;
  }
}

function logEvent(level, source, action, details, extra = {}) {
  if (!shouldLog(level)) return;

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    source,
    action,
    details: details ? String(details) : "",
    week: extra.week || "",
    actorTag: extra.actorTag || "",
    actorId: extra.actorId || "",
    guildId: extra.guildId || "",
    channelId: extra.channelId || "",
    target: extra.target || "",
  };

  // console
  const prefix = `[${payload.level.toUpperCase()}] ${payload.source} • ${payload.action}`;
  if (level === "error") console.error(prefix, payload.details);
  else if (level === "warn") console.warn(prefix, payload.details);
  else console.log(prefix, payload.details);

  // queue => flush
  logQueue.push(payload);
  flushLogs().catch(() => {});
}

// Crash / erreurs globales
process.on("unhandledRejection", (reason) => {
  logEvent("error", "process", "unhandledRejection", String(reason || ""));
});

process.on("uncaughtException", (err) => {
  logEvent("error", "process", "uncaughtException", String(err?.stack || err || ""));
});

client.once(Events.ClientReady, async () => {
  cconsole.log("[AUTO] AUTO_SYNC =", process.env.AUTO_SYNC);
console.log("[AUTO] AUTO_SYNC_INTERVAL_SECONDS =", process.env.AUTO_SYNC_INTERVAL_SECONDS);
console.log("[AUTO] AUTO_SYNC_WEEKS_BACK =", process.env.AUTO_SYNC_WEEKS_BACK);
console.log("[AUTO] AUTO_SYNC_ON_START =", process.env.AUTO_SYNC_ON_START);
  console.log(`✅ Bot prêt : ${client.user.tag}`);
  logEvent("info", "bot", "startup", `✅ Bot prêt : ${client.user.tag}`, {});
});

// ===================== UTILS =====================
function hasPayRole(member) {
  return PAY_ROLE_IDS.length > 0 && member?.roles?.cache?.some((r) => PAY_ROLE_IDS.includes(r.id));
}

function boolLocked(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return ["true", "vrai", "1", "yes", "oui", "lock", "locked"].includes(s);
}

function isSeparatorRow(row) {
  const first = row?.[0];
  return typeof first === "string" && first.trim().startsWith("|");
}

function extractWeek(str) {
  const m = String(str || "").match(/(\d{4}-S\d{2})/);
  return m ? m[1] : null;
}

function hashObject(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

function filterChoices(list, focused) {
  const q = String(focused || "").toLowerCase();
  const filtered = q ? list.filter((x) => String(x).toLowerCase().includes(q)) : list.slice(0);
  return filtered.slice(0, 25).map((x) => ({ name: String(x), value: String(x) }));
}

function pickFirst(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

// ===================== GOOGLE SHEETS CLIENT =====================
let sheetsClient = null;

async function getSheets() {
  if (sheetsClient) return sheetsClient;
  const auth = new google.auth.GoogleAuth({
    keyFile: GOOGLE_KEYFILE,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

async function sheetExists(sheets, title) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const titles = (meta.data.sheets || []).map((s) => s.properties?.title);
  return titles.includes(title);
}

async function ensureStateSheet(sheets, title) {
  const exists = await sheetExists(sheets, title);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title } } }],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${title}!A1:E1`,
    valueInputOption: "RAW",
    requestBody: { values: [["key", "week", "messageId", "hash", "updatedAt"]] },
  });
}

async function readStateMap(sheets, stateSheetTitle) {
  await ensureStateSheet(sheets, stateSheetTitle);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${stateSheetTitle}!A1:E5000`,
  });

  const rows = res.data.values || [];
  const map = new Map();

  for (let i = 1; i < rows.length; i++) {
    const [key, week, messageId, hash] = rows[i] || [];
    if (!key) continue;
    map.set(String(key), {
      key: String(key),
      week: String(week || ""),
      messageId: String(messageId || ""),
      hash: String(hash || ""),
    });
  }

  return map;
}

async function writeStateMap(sheets, stateSheetTitle, map) {
  const header = ["key", "week", "messageId", "hash", "updatedAt"];
  const now = new Date().toISOString();

  const entries = Array.from(map.values())
    .sort((a, b) => (a.week || "").localeCompare(b.week || "") || (a.key || "").localeCompare(b.key || ""));

  const values = [header];
  for (const e of entries) {
    values.push([e.key, e.week, e.messageId, e.hash, now]);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${stateSheetTitle}!A1:E${values.length}`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

async function readSheetTable(sheets, sheetName, range = "A1:Z5000") {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!${range}`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return res.data.values || [];
}

// ===================== PARSE HISTORIQUES (generic) =====================
function parseHistory(rows) {
  if (!rows || rows.length < 2) return { header: [], records: [] };

  const header = (rows[0] || []).map((h) => String(h || "").trim());
  const idxWeek = header.indexOf("Semaine");

  let currentWeek = null;
  const records = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];

    if (isSeparatorRow(r)) {
      const w = extractWeek(r[0]);
      if (w) currentWeek = w;
      continue;
    }

    const hasAny = r.some((x) => x !== "" && x !== null && x !== undefined);
    if (!hasAny) continue;

    const week = idxWeek !== -1 ? String(r[idxWeek] || "") : (currentWeek || "");
    const weekKey = extractWeek(week) || extractWeek(currentWeek) || "";
    if (!weekKey) continue;

    const obj = {};
    for (let c = 0; c < header.length; c++) {
      const colName = header[c] || `COL_${c + 1}`;
      obj[colName] = r[c] ?? "";
    }

    records.push({
      rowIndex: i + 1, // 1-based
      week: weekKey,
      obj,
    });
  }

  return { header, records };
}

function buildGenericEmbed(historyLabel, weekKey, record, flavor) {
  const obj = record.obj || {};

  // Quelques champs "probables" selon historique
  let title = `${flavor.icon} ${historyLabel} — Ligne ${record.rowIndex}`;

  if (flavor.kind === "commandes") {
    const clientName = pickFirst(obj, ["Client", "Nom client", "Client / Nom", "Acheteur", "Prénom et nom"]);
    if (clientName) title = `📦 Commande — ${clientName}`;
  }

  if (flavor.kind === "rachat_employe" || flavor.kind === "rachat_temp") {
    const who = pickFirst(obj, ["Prénom et nom", "Employé", "Nom", "Nom employé", "Acheteur"]);
    if (who) title = `${flavor.icon} ${flavor.title} — ${who}`;
  }

  const possibleId = pickFirst(obj, [
    "ID", "Id", "UUID", "Commande ID", "Id commande", "Numéro", "N°", "N° commande", "Référence", "Reference"
  ]);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(`Semaine: **${weekKey}**${possibleId ? `\nID: **${possibleId}**` : ""}`)
    .setTimestamp(new Date());

  const fields = [];
  for (const [k, v] of Object.entries(obj)) {
    if (!k) continue;
    if (String(k).trim().toLowerCase() === "semaine") continue;

    const val = String(v ?? "").trim();
    if (!val) continue;

    const safe = val.length > 900 ? val.slice(0, 900) + "…" : val;
    fields.push({ name: k, value: safe, inline: safe.length <= 40 });

    if (fields.length >= 20) break;
  }

  if (fields.length) embed.addFields(fields);
  return embed;
}

// ===================== SYNC HISTORIQUE -> DISCORD (generic) =====================
async function resolveTextChannel(channelId) {
  if (!channelId) return null;
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch || !ch.isTextBased?.()) return null;
  return ch;
}

/**
 * Sync create/edit embeds for one week (or all weeks if weekKey = null)
 */
async function syncHistory({
  sheetName,
  stateSheet,
  channelId,
  weekKey, // string or null
  historyLabel,
  flavor, // {kind, icon, title}
}) {
  const sheets = await getSheets();

  const channel = await resolveTextChannel(channelId);
  if (!channel) {
    throw new Error(`Salon Discord introuvable/invalid pour ${historyLabel} (channelId manquant ou mauvais).`);
  }

  const rows = await readSheetTable(sheets, sheetName);
  const { records } = parseHistory(rows);

  const targetRecords = weekKey ? records.filter((r) => r.week === weekKey) : records;

  const stateMap = await readStateMap(sheets, stateSheet);

  let created = 0, edited = 0, skipped = 0;

  for (const rec of targetRecords) {
    const wk = rec.week;
    const key = `${wk}::ROW_${rec.rowIndex}`; // stable si la feuille append
    const h = hashObject({ week: wk, obj: rec.obj });

    const prev = stateMap.get(key);
    const embed = buildGenericEmbed(historyLabel, wk, rec, flavor);

    // inchangé
    if (prev?.hash === h && prev?.messageId) {
      skipped++;
      continue;
    }

    // edit si messageId existe
    if (prev?.messageId) {
      try {
        const msg = await channel.messages.fetch(prev.messageId);
        await msg.edit({ embeds: [embed] });
        edited++;
        stateMap.set(key, { key, week: wk, messageId: prev.messageId, hash: h });
        continue;
      } catch {
        // si message introuvable -> recreate
      }
    }

    // create
    const msg = await channel.send({ embeds: [embed] });
    created++;
    stateMap.set(key, { key, week: wk, messageId: msg.id, hash: h });
  }

  await writeStateMap(sheets, stateSheet, stateMap);

  return { created, edited, skipped, count: targetRecords.length };
}

/**
 * Purge old bot messages for a given week that are not in stateSheet keep-list
 */
async function purgeHistory({
  stateSheet,
  channelId,
  weekKey,
  scan = 300,
  historyLabel,
}) {
  const sheets = await getSheets();
  const channel = await resolveTextChannel(channelId);
  if (!channel) throw new Error(`Salon Discord introuvable/invalid pour ${historyLabel}.`);

  const stateMap = await readStateMap(sheets, stateSheet);
  const keep = new Set();
  for (const v of stateMap.values()) {
    if (String(v.week) === String(weekKey) && /^\d{16,20}$/.test(String(v.messageId))) {
      keep.add(String(v.messageId));
    }
  }

  let deleted = 0, fetched = 0;
  let lastId = null;

  while (fetched < scan) {
    const batch = await channel.messages.fetch({
      limit: Math.min(100, scan - fetched),
      ...(lastId ? { before: lastId } : {}),
    });

    if (!batch.size) break;

    for (const msg of batch.values()) {
      fetched++;
      lastId = msg.id;

      // uniquement messages du bot
      if (msg.author?.id !== client.user.id) continue;

      // garder ceux suivis
      if (keep.has(msg.id)) continue;

      const embedsText = (msg.embeds || [])
        .map((e) => `${e.title || ""} ${e.description || ""} ${e.footer?.text || ""}`)
        .join(" ");

      if (embedsText.includes(weekKey)) {
        try {
          await msg.delete();
          deleted++;
        } catch {}
      }
    }
  }

  return { deleted, scanned: fetched };
}

/**
 * Count records for a week in a history sheet
 */
async function countHistoryWeek(sheetName, weekKey) {
  const sheets = await getSheets();
  const rows = await readSheetTable(sheets, sheetName);
  const { records } = parseHistory(rows);
  return records.filter((r) => r.week === weekKey).length;
}

// ===================== SALAIRES SPECIFIC (lock/pay/reactions + BOT_STATE) =====================
function isLockedValue(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return ["true", "vrai", "1", "yes", "oui", "lock", "locked"].includes(s);
}

async function getBotStateSalairesRows(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${BOT_STATE_SALAIRES}!A1:I5000`,
  });
  return res.data.values || [];
}

async function isWeekLocked(sheets, weekKey) {
  const rows = await getBotStateSalairesRows(sheets);
  if (rows.length <= 1) return false;

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === String(weekKey)) return isLockedValue(rows[i][7]); // H
  }
  return false;
}

async function lockWeek(sheets, weekKey, lockedValue) {
  const rows = await getBotStateSalairesRows(sheets);
  if (rows.length <= 1) return 0;

  let changed = 0;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === String(weekKey)) {
      rows[i][7] = lockedValue ? "true" : "";
      changed++;
    }
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${BOT_STATE_SALAIRES}!A1:I${rows.length}`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });

  return changed;
}

// retrouver week+employe depuis un messageId salaires
async function findStateByMessageId(sheets, messageId) {
  const rows = await getBotStateSalairesRows(sheets);
  if (rows.length <= 1) return null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.some((cell) => String(cell) === String(messageId))) {
      return {
        weekKey: row[1] ? String(row[1]) : null,
        employeName: row[2] ? String(row[2]) : null,
        locked: isLockedValue(row[7]),
      };
    }
  }
  return null;
}

// update statut salaires
function colLetterFromIndex(idx) {
  return String.fromCharCode("A".charCodeAt(0) + idx);
}

async function readSalairesSheet(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SALAIRES_SHEET}!A1:Z5000`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return res.data.values || [];
}

async function updateSalaireStatus(sheets, weekKey, employeName, newStatus) {
  const rows = await readSalairesSheet(sheets);
  if (rows.length < 2) throw new Error("Historique salaires vide.");

  const header = rows[0];
  const idxSemaine = header.indexOf("Semaine");
  const idxNom = header.indexOf("Prénom et nom");
  const idxStatut = header.indexOf("Statut au moment de la clôture");

  if (idxSemaine === -1 || idxNom === -1 || idxStatut === -1) {
    throw new Error("Colonnes introuvables dans Historique salaires.");
  }
  if (idxStatut >= 26) throw new Error("Colonne statut au-delà de Z.");

  let targetRowNumber = null;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (isSeparatorRow(r)) continue;

    const sameWeek = String(r[idxSemaine]) === String(weekKey);
    const sameName = String(r[idxNom] || "").trim().toLowerCase() === String(employeName || "").trim().toLowerCase();

    if (sameWeek && sameName) {
      targetRowNumber = i + 1;
      break;
    }
  }

  if (!targetRowNumber) return false;

  const col = colLetterFromIndex(idxStatut);
  const range = `${SALAIRES_SHEET}!${col}${targetRowNumber}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [[newStatus]] },
  });

  return true;
}

// Fix Payé vs Pas payé
function normalizeFr(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function isPaidStatus(statut) {
  const s = normalizeFr(statut);
  if (s === "paye") return true;
  if (s.startsWith("pas")) return false;
  return false;
}

async function computeSalairesStatus(sheets, weekKey) {
  const rows = await readSalairesSheet(sheets);
  if (rows.length < 2) return null;

  const header = rows[0];
  const idxWeek = header.indexOf("Semaine");
  const idxName = header.indexOf("Prénom et nom");
  const idxTotalPaye = header.indexOf("Total payé");
  const idxStatut = header.indexOf("Statut au moment de la clôture");
  if ([idxWeek, idxName, idxTotalPaye, idxStatut].some((x) => x === -1)) {
    throw new Error("Colonnes manquantes pour /salairesstatus.");
  }

  const people = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (isSeparatorRow(r)) continue;
    if (String(r[idxWeek]) !== String(weekKey)) continue;

    people.push({
      name: String(r[idxName] || ""),
      totalPaye: Number(r[idxTotalPaye] || 0),
      statut: String(r[idxStatut] || ""),
    });
  }

  const paid = people.filter((p) => isPaidStatus(p.statut)).length;
  const unpaid = people.length - paid;
  const total = people.reduce((s, p) => s + (Number.isFinite(p.totalPaye) ? p.totalPaye : 0), 0);

  return { count: people.length, paid, unpaid, total };
}

// ===================== BOT_LINKS =====================
async function ensureLinksSheetExists(sheets) {
  const exists = await sheetExists(sheets, LINKS_SHEET);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: LINKS_SHEET } } }] },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${LINKS_SHEET}!A1:E1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [["telegramme", "employeName", "discordUserId", "active", "updatedAt"]],
    },
  });
}

async function readLinks(sheets) {
  await ensureLinksSheetExists(sheets);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${LINKS_SHEET}!A1:E2000`,
  });
  return res.data.values || [];
}

async function upsertLink(sheets, { telegramme, employeName, discordUserId, active }) {
  const rows = await readLinks(sheets);
  const now = new Date().toISOString();
  const newRow = [telegramme || "", employeName || "", discordUserId, active ? "true" : "false", now];

  if (rows.length <= 1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LINKS_SHEET}!A:E`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [newRow] },
    });
    return { action: "created" };
  }

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][2] || "") === String(discordUserId)) {
      const rowIndex = i + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${LINKS_SHEET}!A${rowIndex}:E${rowIndex}`,
        valueInputOption: "RAW",
        requestBody: { values: [newRow] },
      });
      return { action: "updated" };
    }
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${LINKS_SHEET}!A:E`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [newRow] },
  });
  return { action: "created" };
}

async function deactivateLink(sheets, discordUserId) {
  const rows = await readLinks(sheets);
  if (rows.length <= 1) return { action: "not_found" };

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][2] || "") === String(discordUserId)) {
      const rowIndex = i + 1;
      const now = new Date().toISOString();
      const updated = [rows[i][0] || "", rows[i][1] || "", String(discordUserId), "false", now];

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${LINKS_SHEET}!A${rowIndex}:E${rowIndex}`,
        valueInputOption: "RAW",
        requestBody: { values: [updated] },
      });
      return { action: "disabled" };
    }
  }
  return { action: "not_found" };
}

async function deleteLinkRow(sheets, discordUserId) {
  await ensureLinksSheetExists(sheets);

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const linkSheet = (meta.data.sheets || []).find((s) => s.properties?.title === LINKS_SHEET);
  if (!linkSheet) return { action: "not_found_sheet" };
  const sheetId = linkSheet.properties.sheetId;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${LINKS_SHEET}!A1:E2000`,
  });
  const rows = res.data.values || [];
  if (rows.length <= 1) return { action: "not_found" };

  let rowIndex1Based = null;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][2] || "") === String(discordUserId)) {
      rowIndex1Based = i + 1;
      break;
    }
  }
  if (!rowIndex1Based) return { action: "not_found" };

  const startIndex = rowIndex1Based - 1;
  const endIndex = startIndex + 1;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: { sheetId, dimension: "ROWS", startIndex, endIndex },
          },
        },
      ],
    },
  });

  return { action: "deleted" };
}

async function getEmployeNameByDiscordId(sheets, discordUserId) {
  const rows = await readLinks(sheets);
  for (let i = 1; i < rows.length; i++) {
    const userId = rows[i][2];
    const active = String(rows[i][3] || "").toLowerCase();
    const employeName = rows[i][1];

    if (String(userId) === String(discordUserId) && active === "true" && employeName) {
      return String(employeName);
    }
  }
  return null;
}

// ===================== AUTOCOMPLETE CACHE =====================
const cache = {
  weeks: { ts: 0, data: [] },
  employeesByWeek: new Map(),
};

async function getWeeksUnion(sheets) {
  const now = Date.now();
  if (now - cache.weeks.ts < 60_000 && cache.weeks.data.length) return cache.weeks.data;

  const set = new Set();
  const sheetsToScan = [SALAIRES_SHEET, COMMANDES_SHEET, RACHAT_EMPLOYE_SHEET, RACHAT_TEMPORAIRE_SHEET];

  for (const sheetName of sheetsToScan) {
    try {
      const rows = await readSheetTable(sheets, sheetName);
      const { records } = parseHistory(rows);
      for (const r of records) set.add(r.week);
    } catch {}
  }

  const weeks = Array.from(set).sort();
  cache.weeks = { ts: now, data: weeks };
  return weeks;
}

async function getEmployeesForWeek(sheets, weekKey) {
  const now = Date.now();
  const cached = cache.employeesByWeek.get(weekKey);
  if (cached && now - cached.ts < 60_000) return cached.data;

  const rows = await readSalairesSheet(sheets);
  if (rows.length < 2) return [];

  const header = rows[0];
  const idxWeek = header.indexOf("Semaine");
  const idxName = header.indexOf("Prénom et nom");
  if (idxWeek === -1 || idxName === -1) return [];

  const names = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (isSeparatorRow(r)) continue;
    if (String(r[idxWeek]) === String(weekKey) && r[idxName]) names.push(String(r[idxName]));
  }

  const unique = [...new Set(names)].sort();
  cache.employeesByWeek.set(weekKey, { ts: now, data: unique });
  return unique;
}

// ===================== AUTOCOMPLETE HANDLER (safe) =====================
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isAutocomplete()) return;

  const startedAt = Date.now();

  try {
    const sheets = await getSheets();
    const focused = interaction.options.getFocused(true);

    // anti-timeout : si on est déjà trop lent, on répond vide (sinon "Unknown interaction")
    const tooLate = () => (Date.now() - startedAt) > 2500;

    if (focused.name === "semaine") {
      if (tooLate()) return;

      const weeks = await getWeeksUnion(sheets);

      if (tooLate()) {
        // Discord a probablement déjà expiré l’interaction -> on ne tente pas de respond
        return;
      }

      await interaction.respond(filterChoices(weeks, focused.value)).catch((err) => {
        // 10062 = interaction expirée => on ignore
        if (err?.code === 10062) return;
        // tout le reste: on log mais sans crash
        logEvent("warn", "autocomplete", "respond_error", String(err?.stack || err || ""));
      });
      return;
    }

    if (focused.name === "employe") {
      const weekKey = interaction.options.getString("semaine");
      if (!weekKey) {
        await interaction.respond([]).catch(() => {});
        return;
      }

      if (tooLate()) return;

      const emps = await getEmployeesForWeek(sheets, weekKey);

      if (tooLate()) return;

      await interaction.respond(filterChoices(emps, focused.value)).catch((err) => {
        if (err?.code === 10062) return;
        logEvent("warn", "autocomplete", "respond_error", String(err?.stack || err || ""));
      });
      return;
    }

    // fallback
    await interaction.respond([]).catch(() => {});
  } catch (e) {
    // on n’essaie PAS de re-répondre si ça a planté; on log juste
    logEvent("warn", "autocomplete", "handler_error", String(e?.stack || e || ""));
    try { await interaction.respond([]); } catch {}
  }
});

// ===================== SYNC SALAIRES (dans le bot) =====================

// cache liens (BOT_LINKS) pour éviter de relire Sheets 10x
let _linksCache = { ts: 0, map: new Map() };

function normName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function getLinksMapCached(sheets) {
  const now = Date.now();
  if (now - _linksCache.ts < 60_000 && _linksCache.map.size) return _linksCache.map;

  const rows = await readLinks(sheets); // déjà dans ton bot.js
  const map = new Map(); // employeName(normalisé) -> discordUserId

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

function formatMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? "");
  return (Math.round(n * 100) / 100).toString();
}

function buildSalaireEmbedFromRow(weekKey, obj) {
  const grade = String(obj["Grade"] || "");
  const name = String(obj["Prénom et nom"] || "");
  const tel = String(obj["Télégramme"] || "");
  const statut = String(obj["Statut au moment de la clôture"] || "");

  const embed = new EmbedBuilder()
    .setTitle(`${grade ? `${grade} — ` : ""}${name}`)
    .setDescription(
      `📌 Semaine: **${weekKey}**\n` +
      (statut ? `🧾 Statut: **${statut}**\n` : "") +
      (tel ? `📟 Télégramme: **${tel}**\n` : "")
    )
    .addFields(
      { name: "Production", value: String(obj["Quantité totale produite"] ?? "—"), inline: true },
      { name: "Salaire", value: formatMoney(obj["Salaire"]), inline: true },
      { name: "Prime", value: formatMoney(obj["Prime"]), inline: true },
      { name: "Total rachat", value: String(obj["Total rachat"] ?? "—"), inline: true },
      { name: "Montant rachat", value: formatMoney(obj["Montant rachat"]), inline: true },
      { name: "Total payé", value: formatMoney(obj["Total payé"]), inline: true },
    )
    .setFooter({ text: `LGW • Salaires • ${weekKey}` })
    .setTimestamp(new Date());

  return embed;
}

async function syncSalairesWeek(weekKey) {
  if (!SALAIRES_CHANNEL_ID) throw new Error("SALAIRES_CHANNEL_ID manquant dans .env");

  const sheets = await getSheets();
  const channel = await resolveTextChannel(SALAIRES_CHANNEL_ID);
  if (!channel) throw new Error("Salon salaires invalide.");

  // sécurité lock semaine
  if (await isWeekLocked(sheets, weekKey)) {
    return { locked: true, created: 0, edited: 0, skipped: 0 };
  }

  // lire salaires
  const rows = await readSheetTable(sheets, SALAIRES_SHEET);
  const { header, records } = parseHistory(rows);

  // on ne garde que cette semaine + uniquement les lignes qui ont un nom
  const weekRecords = records
    .filter((r) => r.week === weekKey)
    .filter((r) => String(r.obj?.["Prénom et nom"] || "").trim() !== "");

  // état BOT_STATE (salaires) déjà géré dans ton bot.js
  // On réutilise BOT_STATE salaires tel que ton bot le lit (A..I)
  const stateRows = await getBotStateSalairesRows(sheets);

  // si BOT_STATE vide => pas de header => on init
  if (!stateRows.length) {
    // si ton bot n'a jamais initialisé BOT_STATE, on force une base compatible
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${BOT_STATE_SALAIRES}!A1:I1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          "key","week","employeName","grade","telegramme","channelId","messageId","locked","hash"
        ]],
      },
    });
  }

  // relire après init éventuelle
  const stateRows2 = await getBotStateSalairesRows(sheets);
  const headerState = stateRows2[0] || [];
  const dataState = stateRows2.slice(1);

  // index colonnes BOT_STATE
  const idxKey = 0, idxWeek = 1, idxName = 2, idxGrade = 3, idxTel = 4, idxChan = 5, idxMsg = 6, idxLocked = 7, idxHash = 8;

  // map key -> { rowIndexInData, row }
  const map = new Map();
  for (let i = 0; i < dataState.length; i++) {
    const row = dataState[i] || [];
    const k = String(row[idxKey] || "");
    if (k) map.set(k, { i, row });
  }

  const linksMap = await getLinksMapCached(sheets);

  let created = 0, edited = 0, skipped = 0;

  for (const rec of weekRecords) {
    const employeName = String(rec.obj["Prénom et nom"] || "").trim();
    const key = `${weekKey}::${normName(employeName)}`;
    const newHash = hashObject({ week: weekKey, obj: rec.obj });

    const st = map.get(key);
    const oldHash = st?.row?.[idxHash] ? String(st.row[idxHash]) : "";
    const oldMsgId = st?.row?.[idxMsg] ? String(st.row[idxMsg]) : "";
    const oldLocked = st?.row?.[idxLocked];

    if (boolLocked(oldLocked)) {
      skipped++;
      continue;
    }

    // inchangé
    if (oldMsgId && oldHash === newHash) {
      skipped++;
      continue;
    }

    const embed = buildSalaireEmbedFromRow(weekKey, rec.obj);

    const discordUserId = linksMap.get(normName(employeName));
    const mention = discordUserId ? `<@${discordUserId}>` : "";

    // essayer d’éditer si message existe
    if (oldMsgId) {
      try {
        const msg = await channel.messages.fetch(oldMsgId);
        await msg.edit({
          content: mention,               // ne re-ping pas, mais garde affiché
          embeds: [embed],
          allowedMentions: { parse: [] }, // évite ping sur edit
        });

        edited++;

        // update state row
        const row = st.row;
        row[idxKey] = key;
        row[idxWeek] = weekKey;
        row[idxName] = employeName;
        row[idxGrade] = String(rec.obj["Grade"] || "");
        row[idxTel] = String(rec.obj["Télégramme"] || "");
        row[idxChan] = SALAIRES_CHANNEL_ID;
        row[idxMsg] = oldMsgId;
        row[idxLocked] = ""; // unlocked
        row[idxHash] = newHash;

        continue;
      } catch {
        // message supprimé => on va recréer (et ping)
      }
    }

    // create => ping à chaque création
    const newMsg = await channel.send({
      content: mention,
      embeds: [embed],
      allowedMentions: discordUserId ? { users: [discordUserId] } : { parse: [] },
    });

    created++;

    if (st) {
      const row = st.row;
      row[idxMsg] = newMsg.id;
      row[idxHash] = newHash;
      row[idxChan] = SALAIRES_CHANNEL_ID;
      row[idxWeek] = weekKey;
      row[idxName] = employeName;
      row[idxGrade] = String(rec.obj["Grade"] || "");
      row[idxTel] = String(rec.obj["Télégramme"] || "");
      row[idxLocked] = "";
    } else {
      dataState.push([
        key,
        weekKey,
        employeName,
        String(rec.obj["Grade"] || ""),
        String(rec.obj["Télégramme"] || ""),
        SALAIRES_CHANNEL_ID,
        newMsg.id,
        "",
        newHash,
      ]);
    }
  }

  // réécriture BOT_STATE
  const newState = [headerState.length ? headerState : [
    "key","week","employeName","grade","telegramme","channelId","messageId","locked","hash"
  ], ...dataState];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${BOT_STATE_SALAIRES}!A1:I${newState.length}`,
    valueInputOption: "RAW",
    requestBody: { values: newState },
  });

  return { locked: false, created, edited, skipped };
}

// ===================== COMMANDES HANDLER (Slash commands) =====================
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName; // dispo même si ça crash après

  // log entrée commande
  logEvent("info", "command", `/${cmd}`, "Commande reçue", {
    actorTag: interaction.user?.tag,
    actorId: interaction.user?.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
  });

  try {
    const sheets = await getSheets();

    const adminCommands = new Set([
      // salaires
      "lock", "unlock",
      "pay", "unpay",
      "payuser", "unpayuser",
      "salairesstatus",
      "syncsalaires", "publishsalaires", "purgesalaires",

      // commandes
      "synccommandes", "publishcommandes", "commandesstatus", "purgecommandes", "synccommandesall",

      // rachats
      "syncrachatemploye", "publishrachatemploye", "rachatemployestatus", "purgerachatemploye", "syncrachatemployeall",
      "syncrachattemp", "publishrachattemp", "rachattempstatus", "purgerachattemp", "syncrachattempall",

      // links
      "link", "unlink", "dellink",
    ]);

    // permission
    if (adminCommands.has(cmd) && !hasPayRole(interaction.member)) {
      logEvent("warn", "auth", `/${cmd}`, "Permission refusée", {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });
      return interaction.reply({ content: "⛔ Tu n’as pas la permission.", ephemeral: true });
    }

    // ===================== BOT_LINKS =====================
    if (cmd === "link") {
      await interaction.deferReply({ ephemeral: true });

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

      logEvent("info", "links", "link", `Lien ${result.action}: ${employeName} <-> ${user.id}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        target: `${employeName} | <@${user.id}>`,
      });

      return interaction.editReply(
        `✅ Lien ${result.action}.\nDiscord: <@${user.id}>\nEmployé: **${employeName}**\nTélégramme: **${telegramme || "—"}**\nActif: **${isActive ? "true" : "false"}**`
      );
    }

    if (cmd === "unlink") {
      await interaction.deferReply({ ephemeral: true });

      const user = interaction.options.getUser("user");
      const result = await deactivateLink(sheets, user.id);

      logEvent("info", "links", "unlink", `Action=${result.action} user=${user.id}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        target: `<@${user.id}>`,
      });

      return interaction.editReply(
        result.action === "disabled"
          ? `✅ Lien désactivé pour <@${user.id}>.`
          : `⚠️ Aucun lien trouvé pour <@${user.id}>.`
      );
    }

    if (cmd === "dellink") {
      await interaction.deferReply({ ephemeral: true });

      const user = interaction.options.getUser("user");
      const result = await deleteLinkRow(sheets, user.id);

      logEvent("info", "links", "dellink", `Action=${result.action} user=${user.id}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        target: `<@${user.id}>`,
      });

      if (result.action === "deleted") return interaction.editReply(`🗑️ Ligne supprimée dans BOT_LINKS pour <@${user.id}>.`);
      if (result.action === "not_found") return interaction.editReply(`⚠️ Aucune ligne BOT_LINKS trouvée pour <@${user.id}>.`);
      return interaction.editReply("⚠️ Impossible de supprimer (onglet BOT_LINKS introuvable).");
    }

    // ===================== SALAIRES: LOCK / UNLOCK =====================
    if (cmd === "lock" || cmd === "unlock") {
      await interaction.deferReply({ ephemeral: true });

      const semaine = interaction.options.getString("semaine");
      const changed = await lockWeek(sheets, semaine, cmd === "lock");

      logEvent("info", "salaires", cmd, `${semaine} -> ${cmd.toUpperCase()} (${changed} lignes)`, {
        week: semaine,
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      return interaction.editReply(
        cmd === "lock"
          ? `✅ Semaine **${semaine}** verrouillée (${changed} lignes).`
          : `✅ Semaine **${semaine}** déverrouillée (${changed} lignes).`
      );
    }

    // ===================== SALAIRES STATUS =====================
    if (cmd === "salairesstatus") {
      await interaction.deferReply({ ephemeral: true });

      const semaine = interaction.options.getString("semaine");
      const locked = await isWeekLocked(sheets, semaine);
      const st = await computeSalairesStatus(sheets, semaine);
      if (!st) return interaction.editReply("❌ Impossible de lire les salaires.");

      logEvent("info", "salaires", "status", `week=${semaine} locked=${locked} paid=${st.paid} unpaid=${st.unpaid} total=${st.total}`, {
        week: semaine,
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      return interaction.editReply(
        `📌 **${semaine}**\n` +
        `🔒 Lock: **${locked ? "OUI" : "NON"}**\n` +
        `👥 Employés: **${st.count}** | ✅ Payé: **${st.paid}** | ❌ Pas payé: **${st.unpaid}**\n` +
        `💵 Total (Total payé): **${st.total}**`
      );
    }

    // ===================== SALAIRES SYNC/PUBLISH (info) =====================
    if (cmd === "syncsalaires" || cmd === "publishsalaires") {
  await interaction.deferReply({ ephemeral: true });

  const semaine = interaction.options.getString("semaine");

  const out = await syncSalairesWeek(semaine);

  if (out.locked) {
    logEvent("warn", "salaires", cmd, `Refusé (LOCK) week=${semaine}`, {
      week: semaine,
      actorTag: interaction.user?.tag,
      actorId: interaction.user?.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
    });
    return interaction.editReply(`⛔ Semaine **${semaine}** verrouillée.`);
  }

  logEvent("info", "salaires", cmd, `week=${semaine} created=${out.created} edited=${out.edited} skipped=${out.skipped}`, {
    week: semaine,
    actorTag: interaction.user?.tag,
    actorId: interaction.user?.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
  });

  return interaction.editReply(
    `✅ Salaires **${semaine}** → created: ${out.created}, edited: ${out.edited}, skipped: ${out.skipped}\n` +
    `📌 Ping uniquement sur les créations (limite Discord)`
  );
}

    // ===================== SALAIRES PURGE =====================
    if (cmd === "purgesalaires") {
      await interaction.deferReply({ ephemeral: true });

      const semaine = interaction.options.getString("semaine");
      const scan = interaction.options.getInteger("scan") ?? 300;

      if (!SALAIRES_CHANNEL_ID) return interaction.editReply("❌ SALAIRES_CHANNEL_ID manquant dans .env");

      const channel = await resolveTextChannel(SALAIRES_CHANNEL_ID);
      if (!channel) return interaction.editReply("❌ Salon salaires invalide.");

      const stateRows = await getBotStateSalairesRows(sheets);
      const keep = new Set();
      for (let i = 1; i < stateRows.length; i++) {
        const row = stateRows[i] || [];
        if (String(row[1]) !== String(semaine)) continue;
        for (const cell of row) {
          const s = String(cell || "");
          if (/^\d{16,20}$/.test(s)) keep.add(s);
        }
      }

      let deleted = 0, fetched = 0, lastId = null;

      while (fetched < scan) {
        const batch = await channel.messages.fetch({
          limit: Math.min(100, scan - fetched),
          ...(lastId ? { before: lastId } : {}),
        });
        if (!batch.size) break;

        for (const msg of batch.values()) {
          fetched++;
          lastId = msg.id;

          if (msg.author?.id !== client.user.id) continue;
          if (keep.has(msg.id)) continue;

          const embedsText = (msg.embeds || [])
            .map((e) => `${e.title || ""} ${e.description || ""} ${e.footer?.text || ""}`)
            .join(" ");

          if (embedsText.includes(semaine)) {
            try { await msg.delete(); deleted++; } catch {}
          }
        }
      }

      logEvent("info", "salaires", "purge", `week=${semaine} deleted=${deleted} scanned=${fetched}`, {
        week: semaine,
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      return interaction.editReply(`🧹 Purge salaires terminée (scan ${fetched}) → supprimés: **${deleted}** (semaine ${semaine}).`);
    }

    // ===================== SALAIRES PAY / UNPAY =====================
    if (cmd === "pay" || cmd === "unpay") {
      await interaction.deferReply({ ephemeral: true });

      const semaine = interaction.options.getString("semaine");
      const employe = interaction.options.getString("employe");
      const newStatus = cmd === "pay" ? "Payé" : "Pas payé";

      if (await isWeekLocked(sheets, semaine)) {
        logEvent("warn", "salaires", cmd, `Refusé (week lock) week=${semaine} employe=${employe}`, {
          week: semaine,
          actorTag: interaction.user?.tag,
          actorId: interaction.user?.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          target: employe,
        });
        return interaction.editReply(`⛔ La semaine **${semaine}** est verrouillée.`);
      }

      const ok = await updateSalaireStatus(sheets, semaine, employe, newStatus);
      if (!ok) {
        logEvent("warn", "salaires", cmd, `Employé introuvable week=${semaine} employe=${employe}`, {
          week: semaine,
          actorTag: interaction.user?.tag,
          actorId: interaction.user?.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          target: employe,
        });
        return interaction.editReply(`❌ Employé introuvable pour **${semaine}** : "${employe}"`);
      }

      logEvent("info", "salaires", cmd, `${employe} => ${newStatus}`, {
        week: semaine,
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        target: employe,
      });

      return interaction.editReply(`✅ **${employe}** → **${newStatus}** (compta mise à jour)`);
    }

    // ===================== SALAIRES PAYUSER / UNPAYUSER =====================
    if (cmd === "payuser" || cmd === "unpayuser") {
      await interaction.deferReply({ ephemeral: true });

      const semaine = interaction.options.getString("semaine");
      const user = interaction.options.getUser("user");
      const newStatus = cmd === "payuser" ? "Payé" : "Pas payé";

      if (await isWeekLocked(sheets, semaine)) {
        logEvent("warn", "salaires", cmd, `Refusé (week lock) week=${semaine} user=${user.id}`, {
          week: semaine,
          actorTag: interaction.user?.tag,
          actorId: interaction.user?.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          target: `<@${user.id}>`,
        });
        return interaction.editReply(`⛔ La semaine **${semaine}** est verrouillée.`);
      }

      const employeName = await getEmployeNameByDiscordId(sheets, user.id);
      if (!employeName) {
        logEvent("warn", "salaires", cmd, `Aucun BOT_LINKS actif pour user=${user.id}`, {
          week: semaine,
          actorTag: interaction.user?.tag,
          actorId: interaction.user?.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          target: `<@${user.id}>`,
        });
        return interaction.editReply(`❌ Aucun lien actif BOT_LINKS pour <@${user.id}>. Fais d’abord \`/link\`.`);
      }

      const ok = await updateSalaireStatus(sheets, semaine, employeName, newStatus);
      if (!ok) {
        logEvent("warn", "salaires", cmd, `Employé introuvable en feuille: ${employeName}`, {
          week: semaine,
          actorTag: interaction.user?.tag,
          actorId: interaction.user?.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          target: employeName,
        });
        return interaction.editReply(`❌ Employé introuvable dans Historique salaires: "${employeName}"`);
      }

      logEvent("info", "salaires", cmd, `<@${user.id}> (${employeName}) => ${newStatus}`, {
        week: semaine,
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        target: `<@${user.id}> | ${employeName}`,
      });

      return interaction.editReply(`✅ <@${user.id}> (**${employeName}**) → **${newStatus}** (compta mise à jour)`);
    }

    // ===================== COMMANDES =====================
    if (cmd === "commandesstatus") {
      await interaction.deferReply({ ephemeral: true });
      const semaine = interaction.options.getString("semaine");
      const count = await countHistoryWeek(COMMANDES_SHEET, semaine);

      logEvent("info", "commandes", "status", `week=${semaine} count=${count}`, {
        week: semaine,
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      return interaction.editReply(`📦 **Commandes — ${semaine}**\n🧾 Nombre de lignes: **${count}**`);
    }

    if (cmd === "synccommandes" || cmd === "publishcommandes") {
      await interaction.deferReply({ ephemeral: true });
      const semaine = interaction.options.getString("semaine");

      const out = await syncHistory({
        sheetName: COMMANDES_SHEET,
        stateSheet: BOT_STATE_COMMANDES,
        channelId: COMMANDES_CHANNEL_ID,
        weekKey: semaine,
        historyLabel: "Commande",
        flavor: { kind: "commandes", icon: "📦", title: "Commande" },
      });

      logEvent("info", "commandes", cmd, `week=${semaine} created=${out.created} edited=${out.edited} skipped=${out.skipped}`, {
        week: semaine,
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      return interaction.editReply(`✅ Commandes **${semaine}** → created: ${out.created}, edited: ${out.edited}, skipped: ${out.skipped}`);
    }

    if (cmd === "synccommandesall") {
      await interaction.deferReply({ ephemeral: true });

      const out = await syncHistory({
        sheetName: COMMANDES_SHEET,
        stateSheet: BOT_STATE_COMMANDES,
        channelId: COMMANDES_CHANNEL_ID,
        weekKey: null,
        historyLabel: "Commande",
        flavor: { kind: "commandes", icon: "📦", title: "Commande" },
      });

      logEvent("info", "commandes", "syncall", `created=${out.created} edited=${out.edited} skipped=${out.skipped}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      return interaction.editReply(`✅ Commandes (toutes semaines) → created: ${out.created}, edited: ${out.edited}, skipped: ${out.skipped}`);
    }

    if (cmd === "purgecommandes") {
      await interaction.deferReply({ ephemeral: true });

      const semaine = interaction.options.getString("semaine");
      const scan = interaction.options.getInteger("scan") ?? 300;

      const out = await purgeHistory({
        stateSheet: BOT_STATE_COMMANDES,
        channelId: COMMANDES_CHANNEL_ID,
        weekKey: semaine,
        scan,
        historyLabel: "Commandes",
      });

      logEvent("info", "commandes", "purge", `week=${semaine} deleted=${out.deleted} scanned=${out.scanned}`, {
        week: semaine,
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      return interaction.editReply(`🧹 Purge commandes **${semaine}** → supprimés: **${out.deleted}** (scan ${out.scanned})`);
    }

    // ===================== RACHAT EMPLOYÉ =====================
    if (cmd === "rachatemployestatus") {
      await interaction.deferReply({ ephemeral: true });
      const semaine = interaction.options.getString("semaine");
      const count = await countHistoryWeek(RACHAT_EMPLOYE_SHEET, semaine);

      logEvent("info", "rachat_employe", "status", `week=${semaine} count=${count}`, {
        week: semaine,
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      return interaction.editReply(`👤 **Rachat employé — ${semaine}**\n🧾 Nombre de lignes: **${count}**`);
    }

    if (cmd === "syncrachatemploye" || cmd === "publishrachatemploye") {
      await interaction.deferReply({ ephemeral: true });
      const semaine = interaction.options.getString("semaine");

      const out = await syncHistory({
        sheetName: RACHAT_EMPLOYE_SHEET,
        stateSheet: BOT_STATE_RACHAT_EMPLOYE,
        channelId: RACHAT_EMPLOYE_CHANNEL_ID,
        weekKey: semaine,
        historyLabel: "Rachat employé",
        flavor: { kind: "rachat_employe", icon: "👤", title: "Rachat employé" },
      });

      logEvent("info", "rachat_employe", cmd, `week=${semaine} created=${out.created} edited=${out.edited} skipped=${out.skipped}`, {
        week: semaine,
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      return interaction.editReply(`✅ Rachat employé **${semaine}** → created: ${out.created}, edited: ${out.edited}, skipped: ${out.skipped}`);
    }

    if (cmd === "syncrachatemployeall") {
      await interaction.deferReply({ ephemeral: true });

      const out = await syncHistory({
        sheetName: RACHAT_EMPLOYE_SHEET,
        stateSheet: BOT_STATE_RACHAT_EMPLOYE,
        channelId: RACHAT_EMPLOYE_CHANNEL_ID,
        weekKey: null,
        historyLabel: "Rachat employé",
        flavor: { kind: "rachat_employe", icon: "👤", title: "Rachat employé" },
      });

      logEvent("info", "rachat_employe", "syncall", `created=${out.created} edited=${out.edited} skipped=${out.skipped}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      return interaction.editReply(`✅ Rachat employé (toutes semaines) → created: ${out.created}, edited: ${out.edited}, skipped: ${out.skipped}`);
    }

    if (cmd === "purgerachatemploye") {
      await interaction.deferReply({ ephemeral: true });

      const semaine = interaction.options.getString("semaine");
      const scan = interaction.options.getInteger("scan") ?? 300;

      const out = await purgeHistory({
        stateSheet: BOT_STATE_RACHAT_EMPLOYE,
        channelId: RACHAT_EMPLOYE_CHANNEL_ID,
        weekKey: semaine,
        scan,
        historyLabel: "Rachat employé",
      });

      logEvent("info", "rachat_employe", "purge", `week=${semaine} deleted=${out.deleted} scanned=${out.scanned}`, {
        week: semaine,
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      return interaction.editReply(`🧹 Purge rachat employé **${semaine}** → supprimés: **${out.deleted}** (scan ${out.scanned})`);
    }

    // ===================== RACHAT TEMPORAIRE =====================
    if (cmd === "rachattempstatus") {
      await interaction.deferReply({ ephemeral: true });
      const semaine = interaction.options.getString("semaine");
      const count = await countHistoryWeek(RACHAT_TEMPORAIRE_SHEET, semaine);

      logEvent("info", "rachat_temporaire", "status", `week=${semaine} count=${count}`, {
        week: semaine,
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      return interaction.editReply(`⏳ **Rachat temporaire — ${semaine}**\n🧾 Nombre de lignes: **${count}**`);
    }

    if (cmd === "syncrachattemp" || cmd === "publishrachattemp") {
      await interaction.deferReply({ ephemeral: true });
      const semaine = interaction.options.getString("semaine");

      const out = await syncHistory({
        sheetName: RACHAT_TEMPORAIRE_SHEET,
        stateSheet: BOT_STATE_RACHAT_TEMPORAIRE,
        channelId: RACHAT_TEMPORAIRE_CHANNEL_ID,
        weekKey: semaine,
        historyLabel: "Rachat temporaire",
        flavor: { kind: "rachat_temp", icon: "⏳", title: "Rachat temporaire" },
      });

      logEvent("info", "rachat_temporaire", cmd, `week=${semaine} created=${out.created} edited=${out.edited} skipped=${out.skipped}`, {
        week: semaine,
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      return interaction.editReply(`✅ Rachat temporaire **${semaine}** → created: ${out.created}, edited: ${out.edited}, skipped: ${out.skipped}`);
    }

    if (cmd === "syncrachattempall") {
      await interaction.deferReply({ ephemeral: true });

      const out = await syncHistory({
        sheetName: RACHAT_TEMPORAIRE_SHEET,
        stateSheet: BOT_STATE_RACHAT_TEMPORAIRE,
        channelId: RACHAT_TEMPORAIRE_CHANNEL_ID,
        weekKey: null,
        historyLabel: "Rachat temporaire",
        flavor: { kind: "rachat_temp", icon: "⏳", title: "Rachat temporaire" },
      });

      logEvent("info", "rachat_temporaire", "syncall", `created=${out.created} edited=${out.edited} skipped=${out.skipped}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      return interaction.editReply(`✅ Rachat temporaire (toutes semaines) → created: ${out.created}, edited: ${out.edited}, skipped: ${out.skipped}`);
    }

    if (cmd === "purgerachattemp") {
      await interaction.deferReply({ ephemeral: true });

      const semaine = interaction.options.getString("semaine");
      const scan = interaction.options.getInteger("scan") ?? 300;

      const out = await purgeHistory({
        stateSheet: BOT_STATE_RACHAT_TEMPORAIRE,
        channelId: RACHAT_TEMPORAIRE_CHANNEL_ID,
        weekKey: semaine,
        scan,
        historyLabel: "Rachat temporaire",
      });

      logEvent("info", "rachat_temporaire", "purge", `week=${semaine} deleted=${out.deleted} scanned=${out.scanned}`, {
        week: semaine,
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      return interaction.editReply(`🧹 Purge rachat temporaire **${semaine}** → supprimés: **${out.deleted}** (scan ${out.scanned})`);
    }

    // fallback
    return interaction.reply({ content: "❓ Commande non gérée côté bot.js.", ephemeral: true });
  } catch (e) {
    console.error(e);

    // ✅ LOG ERREUR (le fameux bloc)
    const cmdSafe = interaction?.commandName || "unknown";
    logEvent("error", "command", `/${cmdSafe}`, String(e?.stack || e || ""), {
      actorTag: interaction.user?.tag,
      actorId: interaction.user?.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
    });

    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content: `❌ Erreur: ${e?.message || e}` });
    }
    return interaction.reply({ content: `❌ Erreur: ${e?.message || e}`, ephemeral: true });
  }
});

// ===================== REACTIONS ✅/❌ (SALAIRES) =====================
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    if (user.bot) return;

    if (reaction.partial) await reaction.fetch().catch(() => {});
    if (reaction.message?.partial) await reaction.message.fetch().catch(() => {});

    if (!SALAIRES_CHANNEL_ID) return;
    if (reaction.message.channelId !== SALAIRES_CHANNEL_ID) return;

    const emoji = reaction.emoji?.name;
    if (emoji !== "✅" && emoji !== "❌") return;

    // uniquement message du bot
    if (reaction.message.author?.id !== client.user.id) return;

    const guild = reaction.message.guild;
    if (!guild) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member || !hasPayRole(member)) {
      await user.send("⛔ Tu n’as pas la permission d’utiliser ✅/❌ sur les salaires.").catch(() => {});
      try { await reaction.users.remove(user.id); } catch {}
      return;
    }

    const sheets = await getSheets();
    const state = await findStateByMessageId(sheets, reaction.message.id);
    if (!state?.weekKey || !state?.employeName) return;

    if (state.locked || (await isWeekLocked(sheets, state.weekKey))) {
      await user.send(`⛔ Semaine **${state.weekKey}** verrouillée. Impossible de modifier.`).catch(() => {});
      try { await reaction.users.remove(user.id); } catch {}
      return;
    }

    const newStatus = emoji === "✅" ? "Payé" : "Pas payé";
    const ok = await updateSalaireStatus(sheets, state.weekKey, state.employeName, newStatus);

    if (!ok) {
      await user.send(`❌ Impossible de trouver **${state.employeName}** en **${state.weekKey}** dans la compta.`).catch(() => {});
      try { await reaction.users.remove(user.id); } catch {}
      return;
    }

    try { await reaction.users.remove(user.id); } catch {}
    await user.send(`✅ Modifié: **${state.employeName}** (${state.weekKey}) → **${newStatus}**`).catch(() => {});
  } catch (e) {
    console.error("Reaction handler error:", e);
  }
});

// ===================== START =====================
client.login(DISCORD_TOKEN);