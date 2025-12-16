require("dotenv").config();

const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const { google } = require("googleapis");
const crypto = require("crypto");

// ========= CONFIG =========
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_KEYFILE = process.env.GOOGLE_KEYFILE;

const COMMANDES_CHANNEL_ID = process.env.COMMANDES_CHANNEL_ID;

const COMMANDES_SHEET = "Historique commandes";
const STATE_SHEET = "BOT_STATE_COMMANDES";

if (!DISCORD_TOKEN || !SPREADSHEET_ID || !GOOGLE_KEYFILE || !COMMANDES_CHANNEL_ID) {
  console.error(
    "❌ .env incomplet (DISCORD_TOKEN / SPREADSHEET_ID / GOOGLE_KEYFILE / COMMANDES_CHANNEL_ID requis)"
  );
  process.exit(1);
}

function isSeparatorRow(row) {
  const first = row?.[0];
  return typeof first === "string" && first.trim().startsWith("|");
}

function extractWeekFromSeparator(str) {
  const m = String(str || "").match(/(\d{4}-S\d{2})/);
  return m ? m[1] : null;
}

function hashObject(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: GOOGLE_KEYFILE,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

// ---- Ensure state sheet exists ----
async function ensureStateSheet(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const titles = (meta.data.sheets || []).map((s) => s.properties?.title);
  if (titles.includes(STATE_SHEET)) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: STATE_SHEET } } }] },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${STATE_SHEET}!A1:E1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [["key", "week", "messageId", "hash", "updatedAt"]],
    },
  });
}

async function readState(sheets) {
  await ensureStateSheet(sheets);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${STATE_SHEET}!A1:E5000`,
  });
  const rows = res.data.values || [];
  const map = new Map();

  for (let i = 1; i < rows.length; i++) {
    const [key, week, messageId, h] = rows[i];
    if (key) {
      map.set(String(key), {
        week: String(week || ""),
        messageId: String(messageId || ""),
        hash: String(h || ""),
      });
    }
  }
  return { rows, map };
}

async function writeState(sheets, stateRows) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${STATE_SHEET}!A1:E${stateRows.length}`,
    valueInputOption: "RAW",
    requestBody: { values: stateRows },
  });
}

// ---- Read commandes ----
async function readCommandes(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${COMMANDES_SHEET}!A1:Z5000`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const rows = res.data.values || [];
  if (rows.length < 2) return { header: [], data: [] };

  const header = rows[0].map((h) => String(h || "").trim());
  const idxWeek = header.indexOf("Semaine");

  let currentWeek = null;
  const data = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];

    if (isSeparatorRow(r)) {
      const w = extractWeekFromSeparator(r[0]);
      if (w) currentWeek = w;
      continue;
    }

    if (!r.some((x) => x !== "" && x !== null && x !== undefined)) continue;

    const week = idxWeek !== -1 ? String(r[idxWeek] || "") : currentWeek || "";
    if (!week) continue;

    const obj = {};
    for (let c = 0; c < header.length; c++) {
      const name = header[c] || `COL_${c + 1}`;
      obj[name] = r[c] ?? "";
    }

    data.push({
      rowIndex: i + 1, // 1-based dans Sheets
      week,
      obj,
    });
  }

  return { header, data };
}

function pickFirst(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") return String(obj[k]).trim();
  }
  return "";
}

function buildEmbed(week, record) {
  const obj = record.obj;

  const clientName = pickFirst(obj, ["Client", "Nom client", "Client / Nom", "Acheteur", "Prénom et nom"]);
  const commandeId = pickFirst(obj, ["ID", "Commande ID", "Id commande", "Numéro", "N°", "N° commande"]);
  const titre = clientName ? `📦 Commande — ${clientName}` : `📦 Commande — Ligne ${record.rowIndex}`;

  const embed = new EmbedBuilder()
    .setTitle(titre)
    .setDescription(`Semaine: **${week}**${commandeId ? `\nID: **${commandeId}**` : ""}`)
    .setTimestamp(new Date());

  const fields = [];
  const entries = Object.entries(obj);

  for (const [k, v] of entries) {
    const val = String(v ?? "").trim();
    if (!val) continue;
    if (k.toLowerCase() === "semaine") continue;

    const safe = val.length > 900 ? val.slice(0, 900) + "…" : val;
    fields.push({ name: k, value: safe, inline: safe.length <= 40 });

    if (fields.length >= 20) break;
  }

  if (fields.length) embed.addFields(fields);
  return embed;
}

async function main() {
  const targetWeek = process.argv[2] ? String(process.argv[2]) : null;

  const sheets = await getSheets();
  const { map: stateMap } = await readState(sheets);

  const { data } = await readCommandes(sheets);
  const filtered = targetWeek ? data.filter((d) => d.week === targetWeek) : data;

  console.log(`✅ Commandes lues: ${filtered.length}${targetWeek ? ` (filtré: ${targetWeek})` : ""}`);

  // Discord
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  await new Promise((resolve) => {
    client.once("clientReady", resolve);
    client.login(DISCORD_TOKEN);
  });

  const channel = await client.channels.fetch(COMMANDES_CHANNEL_ID);
  if (!channel?.isTextBased?.()) {
    console.error("❌ COMMANDES_CHANNEL_ID invalide (pas un salon texte).");
    process.exit(1);
  }

  // rebuild state complet
  const newStateRows = [["key", "week", "messageId", "hash", "updatedAt"]];

  let created = 0,
    edited = 0,
    skipped = 0;

  for (const record of filtered) {
    const week = record.week;

    // clé stable : semaine + rowIndex
    const key = `${week}::ROW_${record.rowIndex}`;

    const payloadForHash = { week, obj: record.obj };
    const h = hashObject(payloadForHash);

    const prev = stateMap.get(key);
    const embed = buildEmbed(week, record);

    if (prev?.hash === h && prev?.messageId) {
      newStateRows.push([key, week, prev.messageId, prev.hash, new Date().toISOString()]);
      skipped++;
      continue;
    }

    if (prev?.messageId) {
      try {
        const msg = await channel.messages.fetch(prev.messageId);
        await msg.edit({ embeds: [embed] });
        edited++;
        newStateRows.push([key, week, prev.messageId, h, new Date().toISOString()]);
      } catch {
        const msg = await channel.send({ embeds: [embed] });
        created++;
        newStateRows.push([key, week, msg.id, h, new Date().toISOString()]);
      }
    } else {
      const msg = await channel.send({ embeds: [embed] });
      created++;
      newStateRows.push([key, week, msg.id, h, new Date().toISOString()]);
    }
  }

  await writeState(sheets, newStateRows);

  console.log(`✅ Sync commandes terminée — created: ${created}, edited: ${edited}, skipped: ${skipped}`);

  await client.destroy();
}

main().catch((e) => {
  console.error("❌ Erreur sync commandes:", e);
  process.exit(1);
});