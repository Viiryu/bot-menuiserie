/* bot.js — LGW Menuiserie Bot (4 historiques + réactions ✅/❌ + hosting)
 * Node: CommonJS
 * Dépendances: discord.js, dotenv, googleapis, express
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
} = require("discord.js");

// ===================== HOSTING (Koyeb) =====================
const app = express();
app.get("/", (req, res) => res.status(200).send("OK"));
app.get("/healthz", (req, res) => res.status(200).send("healthy"));
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`🌐 HTTP listening on ${PORT}`));

// ===================== ENV =====================
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Channels
const LOGS_CHANNEL_ID = process.env.LOGS_CHANNEL_ID || "";
const SALAIRES_CHANNEL_ID = process.env.SALAIRES_CHANNEL_ID || "";
const COMMANDES_CHANNEL_ID = process.env.COMMANDES_CHANNEL_ID || "";
const RACHAT_EMPLOYE_CHANNEL_ID = process.env.RACHAT_EMPLOYE_CHANNEL_ID || "";
const RACHAT_TEMPORAIRE_CHANNEL_ID = process.env.RACHAT_TEMPORAIRE_CHANNEL_ID || "";

// Google key file
const GOOGLE_KEYFILE = process.env.GOOGLE_KEYFILE || "service-account.json";
// Optionnel: JSON base64 en env
const GOOGLE_SERVICE_ACCOUNT_JSON_B64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64 || "";

// Permissions (IDs de rôles autorisés, séparés par virgule)
const PAY_ROLE_IDS = (process.env.PAY_ROLE_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Auto-sync
const AUTO_SYNC = String(process.env.AUTO_SYNC || "false").toLowerCase() === "true";
const AUTO_SYNC_INTERVAL_SECONDS = Number(process.env.AUTO_SYNC_INTERVAL_SECONDS || 120);
const AUTO_SYNC_WEEKS_BACK = Number(process.env.AUTO_SYNC_WEEKS_BACK || 2);
const AUTO_SYNC_ON_START = String(process.env.AUTO_SYNC_ON_START || "true").toLowerCase() === "true";

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN manquant (env).");
  process.exit(1);
}
if (!SPREADSHEET_ID) {
  console.error("❌ SPREADSHEET_ID manquant (env).");
  process.exit(1);
}

// ===================== SHEETS (NOMS ONGLET) =====================
const SHEET_SALAIRES = "Historique salaires";
const SHEET_COMMANDES = "Historique commandes";
const SHEET_RACHAT_EMPLOYE = "Historique rachat employé";
const SHEET_RACHAT_TEMP = "Historique rachat temporaire";

const SHEET_BOT_STATE_SALAIRES = "BOT_STATE";
const SHEET_BOT_STATE_COMMANDES = "BOT_STATE_COMMANDES";
const SHEET_BOT_STATE_RACHAT_EMPLOYE = "BOT_STATE_RACHAT_EMPLOYE";
const SHEET_BOT_STATE_RACHAT_TEMP = "BOT_STATE_RACHAT_TEMP";

const SHEET_BOT_LINKS = "BOT_LINKS";

// ===================== UTILS =====================
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
    .map((v) => ({ name: String(v).slice(0, 100), value: String(v).slice(0, 100) }));
}

function safeMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? "—");
  return (Math.round(n * 100) / 100).toString();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function dmUserSafe(user, content) {
  try {
    await user.send(content);
  } catch {
    // DM fermés => on ignore
  }
}

// ===================== GOOGLE: keyfile from base64 env =====================
function ensureKeyfileFromB64() {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON_B64) return;
  try {
    const out = Buffer.from(GOOGLE_SERVICE_ACCOUNT_JSON_B64, "base64").toString("utf8");
    fs.writeFileSync(path.join(__dirname, GOOGLE_KEYFILE), out, "utf8");
    console.log("✅ service-account.json écrit depuis GOOGLE_SERVICE_ACCOUNT_JSON_B64");
  } catch (e) {
    console.error("❌ Impossible d'écrire keyfile depuis base64:", e?.message || e);
  }
}
ensureKeyfileFromB64();

// ===================== GOOGLE SHEETS CLIENT =====================
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
  return (meta.data.sheets || []).map((s) => s.properties?.title).filter(Boolean);
}

async function ensureSheet(sheets, title, headerRow) {
  const titles = await sheetTitles(sheets);
  if (titles.includes(title)) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });

  if (headerRow?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${title}!A1:${String.fromCharCode(64 + headerRow.length)}1`,
      valueInputOption: "RAW",
      requestBody: { values: [headerRow] },
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

async function readSheetTable(sheets, sheetName, maxRows = 5000) {
  return await readRange(sheets, `${sheetName}!A1:Z${maxRows}`);
}

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
      rowIndex: i + 1, // 1-based in sheet
      raw: row,
      obj,
    });
  }

  return { header, records };
}

// ===================== DISCORD CLIENT =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions, // ✅ réactions
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.Reaction,
    Partials.User,
  ],
});

// ===================== LOGGING =====================
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

async function logEvent(level, source, action, message, meta = {}) {
  const line = `[${level.toUpperCase()}] ${source} • ${action} ${message}`;
  console.log(line);

  const ch = await resolveLogsChannel();
  if (!ch) return;

  const metaLines = [];
  for (const [k, v] of Object.entries(meta || {})) {
    if (v === undefined || v === null || String(v).trim() === "") continue;
    metaLines.push(`**${k}**: ${String(v).slice(0, 500)}`);
  }

  const embed = new EmbedBuilder()
    .setTitle(`${source}`)
    .setDescription(`**${level.toUpperCase()}** • **${action}**\n${message}`)
    .addFields(metaLines.slice(0, 20).map((t) => ({ name: "\u200b", value: t })))
    .setFooter({ text: nowStr() })
    .setTimestamp(new Date());

  try {
    await ch.send({ embeds: [embed] });
  } catch {}
}

async function resolveTextChannel(channelId) {
  if (!channelId) return null;
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch && ch.isTextBased?.()) return ch;
  } catch {}
  return null;
}

function hasPayRole(member) {
  try {
    if (!member) return false;
    if (member.permissions?.has?.("Administrator")) return true;
    if (!PAY_ROLE_IDS.length) return true; // pas configuré => autorise
    const roles = member.roles?.cache;
    if (!roles) return false;
    return PAY_ROLE_IDS.some((id) => roles.has(id));
  } catch {
    return false;
  }
}

// ===================== LINKS (BOT_LINKS) =====================
let _linksCache = { ts: 0, map: new Map() };

async function readLinks(sheets) {
  await ensureSheet(sheets, SHEET_BOT_LINKS, ["telegramme", "employeName", "discordUserId", "active", "updatedAt"]);
  return await readRange(sheets, `${SHEET_BOT_LINKS}!A1:E2000`);
}

async function getLinksMapCached(sheets) {
  const now = Date.now();
  if (now - _linksCache.ts < 60_000 && _linksCache.map.size) return _linksCache.map;

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

async function upsertLink(sheets, { telegramme, employeName, discordUserId, active }) {
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
        requestBody: { values: [[telegramme || "", employeName || "", String(discordUserId), String(!!active), now]] },
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
    requestBody: { values: [[telegramme || "", employeName || "", String(discordUserId), String(!!active), now]] },
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
      await updateCell(sheets, `${SHEET_BOT_LINKS}!E${rowNum}`, new Date().toISOString());
      _linksCache = { ts: 0, map: new Map() };
      return { action: "disabled" };
    }
  }
  return { action: "not_found" };
}

async function deleteLinkRow(sheets, discordUserId) {
  const rows = await readLinks(sheets);
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = (meta.data.sheets || []).find((s) => s.properties?.title === SHEET_BOT_LINKS);
  if (!sheet) return { action: "no_sheet" };
  const sheetId = sheet.properties.sheetId;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (String(r[2] || "") === String(discordUserId)) {
      const startIndex = i;
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex,
                endIndex: startIndex + 1,
              },
            },
          }],
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

// ===================== BOT_STATE helpers =====================
async function ensureStateSheet(sheets, title) {
  await ensureSheet(sheets, title, ["key", "week", "name", "channelId", "messageId", "locked", "hash"]);
}

async function ensureStateSheetSalaires(sheets) {
  await ensureSheet(sheets, SHEET_BOT_STATE_SALAIRES, [
    "key", "week", "employeName", "grade", "telegramme", "channelId", "messageId", "locked", "hash",
  ]);
}

async function readStateRows(sheets, sheetTitle, max = 5000) {
  await ensureStateSheet(sheets, sheetTitle);
  return await readRange(sheets, `${sheetTitle}!A1:G${max}`);
}

async function readStateRowsSalaires(sheets, max = 5000) {
  await ensureStateSheetSalaires(sheets);
  return await readRange(sheets, `${SHEET_BOT_STATE_SALAIRES}!A1:I${max}`);
}

// ===================== SALAIRES: lock / status / update =====================
async function isWeekLocked(sheets, weekKey) {
  const rows = await readStateRowsSalaires(sheets);
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (String(r[1] || "") !== String(weekKey)) continue;
    if (boolLocked(r[7])) return true;
  }
  return false;
}

async function lockWeek(sheets, weekKey, lockValue) {
  const rows = await readStateRowsSalaires(sheets);
  let changed = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (String(r[1] || "") !== String(weekKey)) continue;
    r[7] = lockValue ? "true" : "";
    changed++;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_BOT_STATE_SALAIRES}!A1:I${rows.length}`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });

  return changed;
}

async function computeSalairesStatus(sheets, weekKey) {
  const table = await readSheetTable(sheets, SHEET_SALAIRES);
  const { header, records } = parseHistory(table);

  const idxStatut = header.indexOf("Statut au moment de la clôture");
  const idxTotalPaye = header.indexOf("Total payé");

  let count = 0;
  let paid = 0;
  let unpaid = 0;
  let total = 0;

  for (const r of records) {
    if (r.week !== weekKey) continue;
    const name = String(r.obj["Prénom et nom"] || "").trim();
    if (!name) continue;

    count++;
    const statut = idxStatut !== -1
      ? String(r.obj[header[idxStatut]] || "")
      : String(r.obj["Statut au moment de la clôture"] || "");

    if (statut.toLowerCase().includes("pay")) paid++;
    else unpaid++;

    const tp = idxTotalPaye !== -1 ? r.obj[header[idxTotalPaye]] : r.obj["Total payé"];
    total += Number(tp) || 0;
  }

  return { count, paid, unpaid, total: safeMoney(total) };
}

async function updateSalaireStatus(sheets, weekKey, employeName, newStatus) {
  const table = await readSheetTable(sheets, SHEET_SALAIRES);
  const { header, records } = parseHistory(table);

  const idxStatut = header.indexOf("Statut au moment de la clôture");
  const idxName = header.indexOf("Prénom et nom");
  const idxWeek = header.indexOf("Semaine");

  if (idxStatut === -1 || idxName === -1 || idxWeek === -1) {
    throw new Error("Colonnes manquantes dans Historique salaires (Semaine/Prénom et nom/Statut...)");
  }

  for (const r of records) {
    if (r.week !== weekKey) continue;
    const n = String(r.obj[header[idxName]] || "").trim();
    if (normName(n) !== normName(employeName)) continue;

    const colLetter = String.fromCharCode(65 + idxStatut);
    const range = `${SHEET_SALAIRES}!${colLetter}${r.rowIndex}`;
    await updateCell(sheets, range, newStatus);
    return true;
  }

  return false;
}

// ===================== EMBEDS =====================
function buildSalaireEmbed(weekKey, obj) {
  const grade = String(obj["Grade"] || "");
  const name = String(obj["Prénom et nom"] || "");
  const tel = String(obj["Télégramme"] || "");
  const statut = String(obj["Statut au moment de la clôture"] || "");

  return new EmbedBuilder()
    .setTitle(`${grade ? `${grade} — ` : ""}${name}`)
    .setDescription(
      `📌 Semaine: **${weekKey}**\n` +
      (statut ? `🧾 Statut: **${statut}**\n` : "") +
      (tel ? `📟 Télégramme: **${tel}**\n` : "")
    )
    .addFields(
      { name: "Production", value: String(obj["Quantité totale produite"] ?? "—"), inline: true },
      { name: "Salaire", value: safeMoney(obj["Salaire"]), inline: true },
      { name: "Prime", value: safeMoney(obj["Prime"]), inline: true },
      { name: "Total rachat", value: String(obj["Total rachat"] ?? "—"), inline: true },
      { name: "Montant rachat", value: safeMoney(obj["Montant rachat"]), inline: true },
      { name: "Total payé", value: safeMoney(obj["Total payé"]), inline: true },
    )
    .setFooter({ text: `Salaires • ${weekKey}` })
    .setTimestamp(new Date());
}

function guessTitle(obj, fallback) {
  const candidates = ["Prénom et nom", "Client", "Nom du client", "Nom", "Employé", "Produit", "Libellé", "Référence"];
  for (const k of candidates) {
    const v = obj[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return fallback;
}

function buildGenericEmbed(kind, icon, weekKey, obj) {
  const title = guessTitle(obj, `${kind} — ${weekKey}`);
  const embed = new EmbedBuilder()
    .setTitle(`${icon} ${title}`)
    .setDescription(`📌 Semaine: **${weekKey}**`)
    .setFooter({ text: `${kind} • ${weekKey}` })
    .setTimestamp(new Date());

  const fields = [];
  const entries = Object.entries(obj || {});
  for (const [k, v] of entries) {
    if (!k) continue;
    if (k.toLowerCase() === "semaine") continue;
    const val = v === undefined || v === null || String(v).trim() === "" ? "—" : String(v);
    fields.push({ name: String(k).slice(0, 256), value: val.slice(0, 1024), inline: true });
    if (fields.length >= 18) break;
  }
  if (fields.length) embed.addFields(fields);

  return embed;
}

// ===================== SYNC: SALAIRES =====================
async function syncSalairesWeek(weekKey) {
  const sheets = await getSheets();
  await ensureStateSheetSalaires(sheets);

  if (!SALAIRES_CHANNEL_ID) throw new Error("SALAIRES_CHANNEL_ID manquant (env).");
  if (await isWeekLocked(sheets, weekKey)) {
    return { locked: true, created: 0, edited: 0, skipped: 0 };
  }

  const ch = await resolveTextChannel(SALAIRES_CHANNEL_ID);
  if (!ch) throw new Error("Salon salaires invalide.");

  const table = await readSheetTable(sheets, SHEET_SALAIRES);
  const { records } = parseHistory(table);

  const weekRecords = records
    .filter((r) => r.week === weekKey)
    .filter((r) => String(r.obj["Prénom et nom"] || "").trim() !== "");

  const linksMap = await getLinksMapCached(sheets);

  const stateRows = await readStateRowsSalaires(sheets);
  const header = stateRows[0] || [];
  const data = stateRows.slice(1);

  const map = new Map();
  for (let i = 0; i < data.length; i++) {
    const row = data[i] || [];
    const k = String(row[0] || "");
    if (k) map.set(k, { i, row });
  }

  let created = 0, edited = 0, skipped = 0;

  for (const rec of weekRecords) {
    const employeName = String(rec.obj["Prénom et nom"] || "").trim();
    const key = `${weekKey}::${normName(employeName)}`;

    const newHash = sha({ week: weekKey, obj: rec.obj });

    const st = map.get(key);
    const oldMsgId = st?.row?.[6] ? String(st.row[6]) : "";
    const oldLocked = st?.row?.[7];
    const oldHash = st?.row?.[8] ? String(st.row[8]) : "";

    if (boolLocked(oldLocked)) {
      skipped++;
      continue;
    }

    if (oldMsgId && oldHash === newHash) {
      skipped++;
      continue;
    }

    const discordUserId = linksMap.get(normName(employeName));
    const mention = discordUserId ? `<@${discordUserId}>` : "";
    const embed = buildSalaireEmbed(weekKey, rec.obj);

    // EDIT (pas de ping)
    if (oldMsgId) {
      try {
        const msg = await ch.messages.fetch(oldMsgId);
        await msg.edit({
          content: mention,
          embeds: [embed],
          allowedMentions: { parse: [] },
        });

        edited++;

        const row = st.row;
        row[0] = key;
        row[1] = weekKey;
        row[2] = employeName;
        row[3] = String(rec.obj["Grade"] || "");
        row[4] = String(rec.obj["Télégramme"] || "");
        row[5] = SALAIRES_CHANNEL_ID;
        row[6] = oldMsgId;
        row[7] = "";
        row[8] = newHash;

        continue;
      } catch {
        // msg supprimé => create
      }
    }

    // CREATE => ping
    const msg = await ch.send({
      content: mention,
      embeds: [embed],
      allowedMentions: discordUserId ? { users: [discordUserId] } : { parse: [] },
    });

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
      row[7] = "";
      row[8] = newHash;
    } else {
      data.push([
        key,
        weekKey,
        employeName,
        String(rec.obj["Grade"] || ""),
        String(rec.obj["Télégramme"] || ""),
        SALAIRES_CHANNEL_ID,
        msg.id,
        "",
        newHash,
      ]);
    }
  }

  const newState = [header.length ? header : [
    "key", "week", "employeName", "grade", "telegramme", "channelId", "messageId", "locked", "hash",
  ], ...data];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_BOT_STATE_SALAIRES}!A1:I${newState.length}`,
    valueInputOption: "RAW",
    requestBody: { values: newState },
  });

  return { locked: false, created, edited, skipped };
}

// ===================== SYNC: GENERIC (Commandes / Rachats) =====================
async function syncHistoryWeek({ weekKey, sheetName, stateSheet, channelId, kind, icon }) {
  const sheets = await getSheets();
  await ensureStateSheet(sheets, stateSheet);

  if (!channelId) throw new Error(`${kind}: channelId manquant (env).`);
  const ch = await resolveTextChannel(channelId);
  if (!ch) throw new Error(`${kind}: salon invalide.`);

  const table = await readSheetTable(sheets, sheetName);
  const { records } = parseHistory(table);
  const weekRecords = records.filter((r) => r.week === weekKey);

  const stateRows = await readStateRows(sheets, stateSheet);
  const header = stateRows[0] || [];
  const data = stateRows.slice(1);

  const map = new Map();
  for (let i = 0; i < data.length; i++) {
    const row = data[i] || [];
    const k = String(row[0] || "");
    if (k) map.set(k, { i, row });
  }

  let created = 0, edited = 0, skipped = 0;

  for (const rec of weekRecords) {
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
    if (oldMsgId && oldHash === newHash) {
      skipped++;
      continue;
    }

    const embed = buildGenericEmbed(kind, icon, weekKey, rec.obj);

    if (oldMsgId) {
      try {
        const msg = await ch.messages.fetch(oldMsgId);
        await msg.edit({ embeds: [embed] });
        edited++;

        const row = st.row;
        row[0] = key;
        row[1] = weekKey;
        row[2] = guessTitle(rec.obj, `${kind} ${rec.rowIndex}`);
        row[3] = channelId;
        row[4] = oldMsgId;
        row[5] = "";
        row[6] = newHash;

        continue;
      } catch {
        // msg supprimé => create
      }
    }

    const msg = await ch.send({ embeds: [embed] });
    created++;

    if (st) {
      const row = st.row;
      row[0] = key;
      row[1] = weekKey;
      row[2] = guessTitle(rec.obj, `${kind} ${rec.rowIndex}`);
      row[3] = channelId;
      row[4] = msg.id;
      row[5] = "";
      row[6] = newHash;
    } else {
      data.push([
        key,
        weekKey,
        guessTitle(rec.obj, `${kind} ${rec.rowIndex}`),
        channelId,
        msg.id,
        "",
        newHash,
      ]);
    }
  }

  const newState = [header.length ? header : ["key", "week", "name", "channelId", "messageId", "locked", "hash"], ...data];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${stateSheet}!A1:G${newState.length}`,
    valueInputOption: "RAW",
    requestBody: { values: newState },
  });

  return { created, edited, skipped };
}

// ===================== AUTOCOMPLETE DATA =====================
async function getWeeksUnion(sheets) {
  const weeks = [];
  const sheetsToScan = [SHEET_SALAIRES, SHEET_COMMANDES, SHEET_RACHAT_EMPLOYE, SHEET_RACHAT_TEMP];

  for (const sn of sheetsToScan) {
    try {
      const table = await readSheetTable(sheets, sn, 2000);
      const { records } = parseHistory(table);
      for (const r of records) weeks.push(r.week);
    } catch {}
  }
  return sortWeeksDesc(weeks);
}

async function getEmployeesForWeek(sheets, weekKey) {
  const table = await readSheetTable(sheets, SHEET_SALAIRES, 3000);
  const { records } = parseHistory(table);
  return records
    .filter((r) => r.week === weekKey)
    .map((r) => String(r.obj["Prénom et nom"] || "").trim())
    .filter(Boolean);
}

// ===================== AUTOSYNC =====================
let _autoSyncRunning = false;

async function runAutoSyncOnce() {
  if (_autoSyncRunning) return;
  _autoSyncRunning = true;

  try {
    const sheets = await getSheets();
    const weeks = (await getWeeksUnion(sheets)).slice(0, Math.max(1, AUTO_SYNC_WEEKS_BACK));

    await logEvent("info", "autosync", "run", `Weeks: ${weeks.join(", ")}`);

    for (const w of weeks) {
      const outSal = await syncSalairesWeek(w);
      await logEvent("info", "autosync", "salaires", `week=${w} created=${outSal.created} edited=${outSal.edited} skipped=${outSal.skipped} locked=${outSal.locked}`, { week: w });
      await sleep(400);

      const outCmd = await syncHistoryWeek({
        weekKey: w,
        sheetName: SHEET_COMMANDES,
        stateSheet: SHEET_BOT_STATE_COMMANDES,
        channelId: COMMANDES_CHANNEL_ID,
        kind: "Commandes",
        icon: "📦",
      });
      await logEvent("info", "autosync", "commandes", `week=${w} created=${outCmd.created} edited=${outCmd.edited} skipped=${outCmd.skipped}`, { week: w });
      await sleep(400);

      const outRE = await syncHistoryWeek({
        weekKey: w,
        sheetName: SHEET_RACHAT_EMPLOYE,
        stateSheet: SHEET_BOT_STATE_RACHAT_EMPLOYE,
        channelId: RACHAT_EMPLOYE_CHANNEL_ID,
        kind: "Rachat employé",
        icon: "👤",
      });
      await logEvent("info", "autosync", "rachat_employe", `week=${w} created=${outRE.created} edited=${outRE.edited} skipped=${outRE.skipped}`, { week: w });
      await sleep(400);

      const outRT = await syncHistoryWeek({
        weekKey: w,
        sheetName: SHEET_RACHAT_TEMP,
        stateSheet: SHEET_BOT_STATE_RACHAT_TEMP,
        channelId: RACHAT_TEMPORAIRE_CHANNEL_ID,
        kind: "Rachat temporaire",
        icon: "⏳",
      });
      await logEvent("info", "autosync", "rachat_temp", `week=${w} created=${outRT.created} edited=${outRT.edited} skipped=${outRT.skipped}`, { week: w });

      await sleep(600);
    }
  } catch (e) {
    await logEvent("error", "autosync", "run_error", String(e?.stack || e || ""));
  } finally {
    _autoSyncRunning = false;
  }
}

// ===================== AUTOCOMPLETE HANDLER (safe) =====================
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isAutocomplete()) return;

  const startedAt = Date.now();
  const tooLate = () => (Date.now() - startedAt) > 2500;

  try {
    const sheets = await getSheets();
    const focused = interaction.options.getFocused(true);

    if (focused.name === "semaine") {
      if (tooLate()) return;
      const weeks = await getWeeksUnion(sheets);
      if (tooLate()) return;
      await interaction.respond(filterChoices(weeks, focused.value)).catch((err) => {
        if (err?.code === 10062) return; // expired
      });
      return;
    }

    if (focused.name === "employe") {
      const weekKey = interaction.options.getString("semaine");
      if (!weekKey) return interaction.respond([]).catch(() => {});
      if (tooLate()) return;

      const emps = await getEmployeesForWeek(sheets, weekKey);
      if (tooLate()) return;

      await interaction.respond(filterChoices(emps, focused.value)).catch((err) => {
        if (err?.code === 10062) return;
      });
      return;
    }

    await interaction.respond([]).catch(() => {});
  } catch {
    try { await interaction.respond([]); } catch {}
  }
});

// ===================== COMMANDES HANDLER =====================
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;

  try {
    const protectedCommands = new Set([
      "syncsalaires", "salairesstatus", "lock", "unlock", "pay", "unpay", "payuser", "unpayuser",
      "synccommandes", "syncrachatemploye", "syncrachattemp",
      "link", "unlink", "dellink",
    ]);

    if (protectedCommands.has(cmd) && !hasPayRole(interaction.member)) {
      await logEvent("warn", "auth", `/${cmd}`, "Permission refusée", {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });
      return interaction.reply({ content: "⛔ Tu n’as pas la permission.", ephemeral: true });
    }

    const sheets = await getSheets();

    // ----- LINKS -----
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

      await logEvent("info", "links", "link", `Lien ${result.action}: ${employeName} <-> ${user.id}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
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

      await logEvent("info", "links", "unlink", `Action=${result.action} user=${user.id}`, {
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
      await interaction.deferReply({ ephemeral: true });
      const user = interaction.options.getUser("user");
      const result = await deleteLinkRow(sheets, user.id);

      await logEvent("info", "links", "dellink", `Action=${result.action} user=${user.id}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        target: `<@${user.id}>`,
      });

      if (result.action === "deleted") return interaction.editReply(`🗑️ Ligne supprimée dans BOT_LINKS pour <@${user.id}>.`);
      if (result.action === "not_found") return interaction.editReply(`⚠️ Aucune ligne BOT_LINKS trouvée pour <@${user.id}>.`);
      return interaction.editReply("⚠️ Impossible (onglet BOT_LINKS introuvable).");
    }

    // ----- SALAIRES STATUS -----
    if (cmd === "salairesstatus") {
      await interaction.deferReply({ ephemeral: true });
      const semaine = interaction.options.getString("semaine");
      const locked = await isWeekLocked(sheets, semaine);
      const st = await computeSalairesStatus(sheets, semaine);

      await logEvent("info", "salaires", "status", `week=${semaine} locked=${locked} paid=${st.paid} unpaid=${st.unpaid} total=${st.total}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        week: semaine,
      });

      return interaction.editReply(
        `📌 **${semaine}**\n` +
        `🔒 Lock: **${locked ? "OUI" : "NON"}**\n` +
        `👥 Employés: **${st.count}** | ✅ Payé: **${st.paid}** | ❌ Pas payé: **${st.unpaid}**\n` +
        `💵 Total (Total payé): **${st.total}**`
      );
    }

    // ----- LOCK / UNLOCK -----
    if (cmd === "lock" || cmd === "unlock") {
      await interaction.deferReply({ ephemeral: true });
      const semaine = interaction.options.getString("semaine");
      const changed = await lockWeek(sheets, semaine, cmd === "lock");

      await logEvent("info", "salaires", cmd, `${semaine} -> ${cmd.toUpperCase()} (${changed} lignes)`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        week: semaine,
      });

      return interaction.editReply(
        cmd === "lock"
          ? `✅ Semaine **${semaine}** verrouillée (${changed} lignes).`
          : `✅ Semaine **${semaine}** déverrouillée (${changed} lignes).`
      );
    }

    // ----- PAY / UNPAY (par nom) -----
    if (cmd === "pay" || cmd === "unpay") {
      await interaction.deferReply({ ephemeral: true });
      const semaine = interaction.options.getString("semaine");
      const employe = interaction.options.getString("employe");
      const newStatus = cmd === "pay" ? "Payé" : "Pas payé";

      if (await isWeekLocked(sheets, semaine)) {
        return interaction.editReply(`⛔ La semaine **${semaine}** est verrouillée.`);
      }

      const ok = await updateSalaireStatus(sheets, semaine, employe, newStatus);
      if (!ok) return interaction.editReply(`❌ Employé introuvable pour **${semaine}** : "${employe}"`);

      await logEvent("info", "salaires", cmd, `${employe} => ${newStatus}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        week: semaine,
        target: employe,
      });

      // refresh embed semaine
      await syncSalairesWeek(semaine).catch(() => {});
      return interaction.editReply(`✅ **${employe}** → **${newStatus}** (compta + embed mis à jour)`);
    }

    // ----- PAYUSER / UNPAYUSER (par user lié) -----
    if (cmd === "payuser" || cmd === "unpayuser") {
      await interaction.deferReply({ ephemeral: true });
      const semaine = interaction.options.getString("semaine");
      const user = interaction.options.getUser("user");
      const newStatus = cmd === "payuser" ? "Payé" : "Pas payé";

      if (await isWeekLocked(sheets, semaine)) {
        return interaction.editReply(`⛔ La semaine **${semaine}** est verrouillée.`);
      }

      const employeName = await getEmployeNameByDiscordId(sheets, user.id);
      if (!employeName) return interaction.editReply(`❌ Aucun lien actif BOT_LINKS pour <@${user.id}>. Fais d’abord \`/link\`.`);

      const ok = await updateSalaireStatus(sheets, semaine, employeName, newStatus);
      if (!ok) return interaction.editReply(`❌ Employé introuvable dans Historique salaires: "${employeName}"`);

      await logEvent("info", "salaires", cmd, `<@${user.id}> (${employeName}) => ${newStatus}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        week: semaine,
        target: `<@${user.id}> | ${employeName}`,
      });

      await syncSalairesWeek(semaine).catch(() => {});
      return interaction.editReply(`✅ <@${user.id}> (**${employeName}**) → **${newStatus}** (compta + embed mis à jour)`);
    }

    // ----- SYNC SALAIRES -----
    if (cmd === "syncsalaires") {
      await interaction.deferReply({ ephemeral: true });
      const semaine = interaction.options.getString("semaine");

      const out = await syncSalairesWeek(semaine);
      if (out.locked) return interaction.editReply(`⛔ Semaine **${semaine}** verrouillée.`);

      await logEvent("info", "salaires", "sync", `week=${semaine} created=${out.created} edited=${out.edited} skipped=${out.skipped}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        week: semaine,
      });

      return interaction.editReply(`✅ Salaires **${semaine}** → created:${out.created} edited:${out.edited} skipped:${out.skipped}`);
    }

    // ----- SYNC COMMANDES -----
    if (cmd === "synccommandes") {
      await interaction.deferReply({ ephemeral: true });
      const semaine = interaction.options.getString("semaine");

      const out = await syncHistoryWeek({
        weekKey: semaine,
        sheetName: SHEET_COMMANDES,
        stateSheet: SHEET_BOT_STATE_COMMANDES,
        channelId: COMMANDES_CHANNEL_ID,
        kind: "Commandes",
        icon: "📦",
      });

      await logEvent("info", "commandes", "sync", `week=${semaine} created=${out.created} edited=${out.edited} skipped=${out.skipped}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        week: semaine,
      });

      return interaction.editReply(`✅ Commandes **${semaine}** → created:${out.created} edited:${out.edited} skipped:${out.skipped}`);
    }

    // ----- SYNC RACHAT EMPLOYÉ -----
    if (cmd === "syncrachatemploye") {
      await interaction.deferReply({ ephemeral: true });
      const semaine = interaction.options.getString("semaine");

      const out = await syncHistoryWeek({
        weekKey: semaine,
        sheetName: SHEET_RACHAT_EMPLOYE,
        stateSheet: SHEET_BOT_STATE_RACHAT_EMPLOYE,
        channelId: RACHAT_EMPLOYE_CHANNEL_ID,
        kind: "Rachat employé",
        icon: "👤",
      });

      await logEvent("info", "rachat_employe", "sync", `week=${semaine} created=${out.created} edited=${out.edited} skipped=${out.skipped}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        week: semaine,
      });

      return interaction.editReply(`✅ Rachat employé **${semaine}** → created:${out.created} edited:${out.edited} skipped:${out.skipped}`);
    }

    // ----- SYNC RACHAT TEMP -----
    if (cmd === "syncrachattemp") {
      await interaction.deferReply({ ephemeral: true });
      const semaine = interaction.options.getString("semaine");

      const out = await syncHistoryWeek({
        weekKey: semaine,
        sheetName: SHEET_RACHAT_TEMP,
        stateSheet: SHEET_BOT_STATE_RACHAT_TEMP,
        channelId: RACHAT_TEMPORAIRE_CHANNEL_ID,
        kind: "Rachat temporaire",
        icon: "⏳",
      });

      await logEvent("info", "rachat_temp", "sync", `week=${semaine} created=${out.created} edited=${out.edited} skipped=${out.skipped}`, {
        actorTag: interaction.user?.tag,
        actorId: interaction.user?.id,
        week: semaine,
      });

      return interaction.editReply(`✅ Rachat temporaire **${semaine}** → created:${out.created} edited:${out.edited} skipped:${out.skipped}`);
    }

    return interaction.reply({ content: "❓ Commande non gérée côté bot.js.", ephemeral: true });
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
    return interaction.reply({ content: `❌ Erreur: ${e?.message || e}`, ephemeral: true });
  }
});

// ===================== ✅/❌ REACTIONS SUR SALAIRES =====================
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    if (user.bot) return;

    // partials
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const emoji = reaction.emoji?.name;
    if (emoji !== "✅" && emoji !== "❌") return;

    const msg = reaction.message;

    // uniquement salon salaires
    if (!SALAIRES_CHANNEL_ID || msg.channelId !== SALAIRES_CHANNEL_ID) return;

    // uniquement messages du bot
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

    // retrouver semaine + employé via BOT_STATE (messageId)
    const stateRows = await readStateRowsSalaires(sheets);
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
      await dmUserSafe(user, "⚠️ Impossible : je n’ai pas trouvé la semaine/l’employé lié à ce message (BOT_STATE).");
      await logEvent("warn", "reaction", "state_not_found", `messageId=${msg.id}`, {
        actorTag: user.tag,
        actorId: user.id,
        channelId: msg.channelId,
      });
      return;
    }

    // lock semaine
    const locked = await isWeekLocked(sheets, weekKey);
    if (locked) {
      await reaction.users.remove(user.id).catch(() => {});
      await dmUserSafe(user, `⛔ La semaine **${weekKey}** est verrouillée. (Aucun changement effectué)`);
      await logEvent("info", "reaction", "locked", `week=${weekKey} ${employeName}`, {
        actorTag: user.tag,
        actorId: user.id,
        week: weekKey,
        target: employeName,
      });
      return;
    }

    // update Sheets
    const newStatus = emoji === "✅" ? "Payé" : "Pas payé";
    const ok = await updateSalaireStatus(sheets, weekKey, employeName, newStatus);

    if (!ok) {
      await reaction.users.remove(user.id).catch(() => {});
      await dmUserSafe(user, `❌ Impossible de mettre à jour: employé introuvable dans la semaine **${weekKey}**.`);
      await logEvent("error", "reaction", "update_failed", `week=${weekKey} ${employeName}`, {
        actorTag: user.tag,
        actorId: user.id,
        week: weekKey,
        target: employeName,
      });
      return;
    }

    await logEvent("info", "reaction", "status_changed", `${employeName} => ${newStatus} (${weekKey})`, {
      actorTag: user.tag,
      actorId: user.id,
      week: weekKey,
      target: employeName,
    });

    // refresh embed semaine (pas de ping)
    const out = await syncSalairesWeek(weekKey);
    await logEvent("info", "reaction", "embed_refresh", `week=${weekKey} created=${out.created} edited=${out.edited} skipped=${out.skipped}`, {
      actorTag: user.tag,
      actorId: user.id,
      week: weekKey,
    });

    // nettoyer la réaction
    await reaction.users.remove(user.id).catch(() => {});

    // confirmation privée
    await dmUserSafe(user, `✅ OK : **${employeName}** est maintenant **${newStatus}** pour **${weekKey}**.`);
  } catch (e) {
    await logEvent("error", "reaction", "handler_error", String(e?.stack || e || ""));
  }
});

// ===================== PROCESS SAFETY =====================
process.on("unhandledRejection", async (err) => {
  await logEvent("error", "process", "unhandledRejection", String(err?.stack || err || ""));
});

process.on("uncaughtException", async (err) => {
  await logEvent("error", "process", "uncaughtException", String(err?.stack || err || ""));
  process.exit(1);
});

// ===================== READY =====================
client.once(Events.ClientReady, async () => {
  console.log("[AUTO] AUTO_SYNC =", process.env.AUTO_SYNC);
  console.log("[AUTO] AUTO_SYNC_INTERVAL_SECONDS =", process.env.AUTO_SYNC_INTERVAL_SECONDS);
  console.log("[AUTO] AUTO_SYNC_WEEKS_BACK =", process.env.AUTO_SYNC_WEEKS_BACK);
  console.log("[AUTO] AUTO_SYNC_ON_START =", process.env.AUTO_SYNC_ON_START);

  await logEvent("info", "bot", "startup", `✅ Bot prêt : ${client.user.tag}`);

  // Auto-sync (si activé)
  if (AUTO_SYNC) {
    await logEvent("info", "autosync", "enabled", `interval=${AUTO_SYNC_INTERVAL_SECONDS}s weeksBack=${AUTO_SYNC_WEEKS_BACK}`);
    if (AUTO_SYNC_ON_START) runAutoSyncOnce().catch(() => {});
    setInterval(() => runAutoSyncOnce().catch(() => {}), AUTO_SYNC_INTERVAL_SECONDS * 1000);
  }
});

// ===================== START =====================
client.login(DISCORD_TOKEN);
