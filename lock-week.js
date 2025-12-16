require("dotenv").config();
const { google } = require("googleapis");

const spreadsheetId = process.env.SPREADSHEET_ID;
const keyFile = process.env.GOOGLE_KEYFILE;

async function main() {
  const weekKey = process.argv[2]; // ex: 2025-S50
  if (!weekKey) {
    console.log("❌ Utilisation: node lock-week.js 2025-S50");
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // Lit BOT_STATE
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "BOT_STATE!A1:I2000",
  });
  const rows = res.data.values || [];
  if (rows.length <= 1) {
    console.log("❌ BOT_STATE vide (rien à lock).");
    return;
  }

  let changed = 0;

  // On parcourt toutes les lignes (en sautant l'en-tête)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowWeek = row[1]; // weekKey
    if (String(rowWeek) === String(weekKey)) {
      // colonne locked = index 7 (H)
      row[7] = "true";
      changed++;
    }
  }

  if (changed === 0) {
    console.log(`⚠️ Aucune ligne trouvée pour ${weekKey}`);
    return;
  }

  // Réécrit tout BOT_STATE (simple et efficace)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `BOT_STATE!A1:I${rows.length}`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });

  console.log(`✅ Semaine lock: ${weekKey} (${changed} lignes)`);
}

main().catch((err) => {
  console.error("❌", err?.message || err);
  if (err?.response?.data) console.error(err.response.data);
});
