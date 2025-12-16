/**
 * sync-salaires-state.js
 * Usage:
 *   node sync-salaires-state.js          -> sync toutes les semaines trouvées
 *   node sync-salaires-state.js 2025-S50 -> sync une semaine
 */

require("dotenv").config();

const crypto = require("crypto");
const { google } = require("googleapis");
const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
} = require("discord.js");

// ===================== ENV =====================
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SALAIRES_CHANNEL_ID = process.env.SALAIRES_CHANNEL_ID;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_KEYFILE = process.env.GOOGLE_KEYFILE || "service-account.json";

if (!DISCORD_TOKEN || !SALAIRES_CHANNEL_ID || !SPREADSHEET_ID || !GOOGLE_KEYFILE) {
  console.error("❌ .env incomplet: DISCORD_TOKEN / SALAIRES_CHANNEL_ID / SPREADSHEET_ID / GOOGLE_KEYFILE requis.");
  process.exit(1);
}

// ===================== SHEET NAMES =====================
const SALAIRES_SHEET = "Historique salaires";
const STATE_SHEET = "BOT_STATE";     // A..I, lock en H (col 8)
const LINKS_SHEET = "BOT_LINKS";     // telegramme | employeName | discordUserId | active | updatedAt

// ===================== HELPERS =====================
function isSeparatorRow(row) {
  const first = row?.[0];
  return typeof first === "string" && first.trim().startsWith("|");
}

function extractWeek(str) {
  const m = String(str || "").match(/(\d{4}-S\d{2})/);
  return m ? m[1] : null;
}

function normalize(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hashObject(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

function boolLocked(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return ["true", "vrai", "1", "yes", "oui", "lock", "locked"].includes(s);
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(v) {
  const n = safeNumber(v);
  // pas de format trop fancy, juste propre
  return (Math.round(n * 100) / 100).toString();
}

// Grade ordering (tu peux ajuster)
const GRADE_ORDER = [
  "patron",
  "co-patron",
  "copatron",
  "contremaitre",
  "contremaître",
  "employe",
  "employé",
  "employe en formation",
  "employé en formation",
];

function gradeRank(grade) {
  const g = normalize(grade);
  const idx = GRADE_ORDER.indexOf(g);
  return idx === -1 ? 999 : idx;
}

// ===================== GOOGLE SHEETS =====================
async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: GOOGLE_KEYFILE,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function readRange(sheets, range) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return res.data.values || [];
}

async function ensureStateSheet(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const titles = (meta.data.sheets || []).map((s) => s.properties?.title);
  if (titles.includes(STATE_SHEET)) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: STATE_SHEET } } }] },
  });

  // A..I (9 colonnes) avec lock en H
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${STATE_SHEET}!A1:I1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        "key",          // A
        "week",         // B
        "employeName",  // C
        "grade",        // D
        "telegramme",   // E
        "channelId",    // F
        "messageId",    // G
        "locked",       // H  <- IMPORTANT
        "hash",         // I
      ]],
    },
  });
}

async function readState(sheets) {
  await ensureStateSheet(sheets);
  const rows = await readRange(sheets, `${STATE_SHEET}!A1:I5000`);
  if (rows.length === 0) return { header: [], rows: [], map: new Map() };

  const map = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const key = String(r[0] || "");
    if (!key) continue;

    map.set(key, {
      rowIndex: i,          // index dans rows (0-based)
      key,
      week: String(r[1] || ""),
      employeName: String(r[2] || ""),
      grade: String(r[3] || ""),
      telegramme: String(r[4] || ""),
      channelId: String(r[5] || ""),
      messageId: String(r[6] || ""),
      locked: boolLocked(r[7]),
      hash: String(r[8] || ""),
    });
  }

  return { header: rows[0], rows, map };
}

async function writeState(sheets, rows) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${STATE_SHEET}!A1:I${rows.length}`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
}

// BOT_LINKS map: employeName(normalisé) -> discordUserId
async function loadBotLinks(sheets) {
  const rows = await readRange(sheets, `${LINKS_SHEET}!A1:E2000`);
  const map = new Map();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const employeName = r[1];
    const discordUserId = r[2];
    const active = String(r[3] || "").toLowerCase() === "true";
    if (!active) continue;
    if (!employeName || !discordUserId) continue;

    map.set(normalize(employeName), String(discordUserId));
  }

  return map;
}

// ===================== SALAIRES PARSING =====================
async function readSalaires(sheets) {
  const rows = await readRange(sheets, `${SALAIRES_SHEET}!A1:Z5000`);
  if (rows.length < 2) return { header: [], records: [] };

  const header = (rows[0] || []).map((h) => String(h || "").trim());

  const idxWeek = header.indexOf("Semaine");
  const idxClose = header.indexOf("Date de clôture");
  const idxName = header.indexOf("Prénom et nom");
  const idxGrade = header.indexOf("Grade");
  const idxTel = header.indexOf("Télégramme");
  const idxProd = header.indexOf("Quantité totale produite");
  const idxSalaire = header.indexOf("Salaire");
  const idxPrime = header.indexOf("Prime");
  const idxTotalRachat = header.indexOf("Total rachat");
  const idxMontantRachat = header.indexOf("Montant rachat");
  const idxTotalPaye = header.indexOf("Total payé");
  const idxStatut = header.indexOf("Statut au moment de la clôture");

  if ([idxWeek, idxName].some((x) => x === -1)) {
    throw new Error("❌ Colonnes introuvables dans Historique salaires (au moins 'Semaine' et 'Prénom et nom').");
  }

  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (isSeparatorRow(r)) continue;

    const weekKey = extractWeek(r[idxWeek]);
    if (!weekKey) continue;

    const employeName = String(r[idxName] || "").trim();
    if (!employeName) continue;

    records.push({
      rowIndex: i + 1,
      week: weekKey,
      closeDate: idxClose !== -1 ? r[idxClose] : "",
      employeName,
      grade: idxGrade !== -1 ? String(r[idxGrade] || "") : "",
      telegramme: idxTel !== -1 ? String(r[idxTel] || "") : "",
      production: idxProd !== -1 ? r[idxProd] : "",
      salaire: idxSalaire !== -1 ? r[idxSalaire] : "",
      prime: idxPrime !== -1 ? r[idxPrime] : "",
      totalRachat: idxTotalRachat !== -1 ? r[idxTotalRachat] : "",
      montantRachat: idxMontantRachat !== -1 ? r[idxMontantRachat] : "",
      totalPaye: idxTotalPaye !== -1 ? r[idxTotalPaye] : "",
      statut: idxStatut !== -1 ? String(r[idxStatut] || "") : "",
    });
  }

  // tri : semaine puis grade puis nom
  records.sort((a, b) => {
    if (a.week !== b.week) return a.week.localeCompare(b.week);
    const ga = gradeRank(a.grade);
    const gb = gradeRank(b.grade);
    if (ga !== gb) return ga - gb;
    return a.employeName.localeCompare(b.employeName);
  });

  return { header, records };
}

function buildSalaireEmbed(rec) {
  const embed = new EmbedBuilder()
    .setTitle(`${rec.grade ? `${rec.grade} — ` : ""}${rec.employeName}`)
    .setDescription(
      `📌 Semaine: **${rec.week}**\n` +
      (rec.statut ? `🧾 Statut: **${rec.statut}**\n` : "") +
      (rec.telegramme ? `📟 Télégramme: **${rec.telegramme}**\n` : "")
    )
    .setTimestamp(new Date());

  const fields = [];

  if (rec.production !== "" && rec.production !== null && rec.production !== undefined) {
    fields.push({ name: "Production", value: String(rec.production), inline: true });
  }
  if (rec.salaire !== "" && rec.salaire !== null && rec.salaire !== undefined) {
    fields.push({ name: "Salaire", value: formatMoney(rec.salaire), inline: true });
  }
  if (rec.prime !== "" && rec.prime !== null && rec.prime !== undefined) {
    fields.push({ name: "Prime", value: formatMoney(rec.prime), inline: true });
  }
  if (rec.totalRachat !== "" && rec.totalRachat !== null && rec.totalRachat !== undefined) {
    fields.push({ name: "Total rachat", value: String(rec.totalRachat), inline: true });
  }
  if (rec.montantRachat !== "" && rec.montantRachat !== null && rec.montantRachat !== undefined) {
    fields.push({ name: "Montant rachat", value: formatMoney(rec.montantRachat), inline: true });
  }
  if (rec.totalPaye !== "" && rec.totalPaye !== null && rec.totalPaye !== undefined) {
    fields.push({ name: "Total payé", value: formatMoney(rec.totalPaye), inline: true });
  }

  if (fields.length) embed.addFields(fields.slice(0, 25));
  embed.setFooter({ text: `LGW • Salaires • ${rec.week}` });

  return embed;
}

// ===================== DISCORD =====================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// ===================== MAIN SYNC =====================
async function main() {
  const weekArg = process.argv[2] || null;

  const sheets = await getSheets();
  const linksMap = await loadBotLinks(sheets).catch(() => new Map());

  const { records } = await readSalaires(sheets);
  const weeksFound = [...new Set(records.map((r) => r.week))];

  if (weeksFound.length === 0) {
    console.log("❌ Aucune semaine trouvée dans Historique salaires.");
    process.exit(0);
  }

  const weeksToSync = weekArg ? [weekArg] : weeksFound;
  console.log(`✅ Semaines trouvées : ${weeksFound.join(", ")}`);
  if (weekArg) console.log(`\n📌 Lecture semaine : ${weekArg}`);

  const state = await readState(sheets);
  const stateRows = state.rows.length ? state.rows : [state.header];

  await client.login(DISCORD_TOKEN);
  await new Promise((res) => client.once(Events.ClientReady, res));
  console.log(`✅ Discord connecté : ${client.user.tag}`);

  const channel = await client.channels.fetch(SALAIRES_CHANNEL_ID);
  if (!channel || !channel.isTextBased?.()) {
    throw new Error("❌ SALAIRES_CHANNEL_ID invalide (salon introuvable ou non textuel).");
  }

  let created = 0;
  let edited = 0;
  let skipped = 0;

  for (const weekKey of weeksToSync) {
    const weekRecords = records.filter((r) => r.week === weekKey);

    // lock: si toutes les lignes du week sont lockées dans BOT_STATE, on skip
    // (on détecte un lock dès qu'on trouve une ligne de cette week avec locked=true)
    let weekIsLocked = false;
    for (const s of state.map.values()) {
      if (s.week === weekKey && s.locked) {
        weekIsLocked = true;
        break;
      }
    }

    if (weekIsLocked) {
      for (const rec of weekRecords) {
        console.log(`⛔ LOCKED: ${weekKey} | ${rec.employeName}`);
      }
      skipped += weekRecords.length;
      continue;
    }

    for (const rec of weekRecords) {
      const key = `${rec.week}::${normalize(rec.employeName)}`;
      const embed = buildSalaireEmbed(rec);

      const newHash = hashObject({
        week: rec.week,
        employeName: rec.employeName,
        grade: rec.grade,
        telegramme: rec.telegramme,
        production: rec.production,
        salaire: rec.salaire,
        prime: rec.prime,
        totalRachat: rec.totalRachat,
        montantRachat: rec.montantRachat,
        totalPaye: rec.totalPaye,
        statut: rec.statut,
      });

      const st = state.map.get(key);

      // si existant et même hash => skip
      if (st?.hash === newHash && st?.messageId) {
        skipped++;
        continue;
      }

      const discordUserId = linksMap.get(normalize(rec.employeName));
      const mention = discordUserId ? `<@${discordUserId}>` : "";

      // Edit si message existe
      if (st?.messageId) {
        try {
          const msg = await channel.messages.fetch(st.messageId);
          await msg.edit({
            content: mention,                 // garde visible, mais ne reping pas (edit)
            embeds: [embed],
            allowedMentions: { parse: [] },   // sécurité anti ping sur edit
          });

          edited++;

          // update state row
          const rowIndex = st.rowIndex;
          const row = stateRows[rowIndex] || [];
          row[0] = key;
          row[1] = rec.week;
          row[2] = rec.employeName;
          row[3] = rec.grade;
          row[4] = rec.telegramme;
          row[5] = SALAIRES_CHANNEL_ID;
          row[6] = st.messageId;
          row[7] = ""; // unlocked
          row[8] = newHash;
          stateRows[rowIndex] = row;

          // update cache state map
          state.map.set(key, { ...st, hash: newHash });

          continue;
        } catch {
          // message supprimé -> on recrée et ça reping (car création)
        }
      }

      // Create (et ping à chaque création)
      const msg = await channel.send({
        content: mention,
        embeds: [embed],
        allowedMentions: discordUserId ? { users: [discordUserId] } : { parse: [] },
      });
      created++;

      // si la clé existait mais msg introuvable, on réutilise la même ligne
      if (st) {
        const rowIndex = st.rowIndex;
        const row = stateRows[rowIndex] || [];
        row[0] = key;
        row[1] = rec.week;
        row[2] = rec.employeName;
        row[3] = rec.grade;
        row[4] = rec.telegramme;
        row[5] = SALAIRES_CHANNEL_ID;
        row[6] = msg.id;
        row[7] = ""; // unlocked
        row[8] = newHash;
        stateRows[rowIndex] = row;

        state.map.set(key, { ...st, messageId: msg.id, hash: newHash, locked: false });
      } else {
        // nouvelle ligne
        stateRows.push([
          key,
          rec.week,
          rec.employeName,
          rec.grade,
          rec.telegramme,
          SALAIRES_CHANNEL_ID,
          msg.id,
          "",      // locked
          newHash, // hash
        ]);

        state.map.set(key, {
          rowIndex: stateRows.length - 1,
          key,
          week: rec.week,
          employeName: rec.employeName,
          grade: rec.grade,
          telegramme: rec.telegramme,
          channelId: SALAIRES_CHANNEL_ID,
          messageId: msg.id,
          locked: false,
          hash: newHash,
        });
      }
    }
  }

  // write state back
  // (garantit header)
  if (stateRows.length === 0) {
    stateRows.push([
      "key", "week", "employeName", "grade", "telegramme", "channelId", "messageId", "locked", "hash",
    ]);
  } else if (stateRows[0]?.[7] !== "locked") {
    // si header bizarre, on force un header correct
    stateRows[0] = [
      "key", "week", "employeName", "grade", "telegramme", "channelId", "messageId", "locked", "hash",
    ];
  }

  await writeState(sheets, stateRows);

  console.log(`✅ Sync terminé — created: ${created}, edited: ${edited}, skipped: ${skipped}`);

  await client.destroy();
}

// ===================== RUN =====================
main().catch(async (err) => {
  console.error("❌ Erreur sync-salaires-state:", err?.stack || err);
  try { await client.destroy(); } catch {}
  process.exit(1);
});