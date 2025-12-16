require("dotenv").config();
const { google } = require("googleapis");

const spreadsheetId = process.env.SPREADSHEET_ID;
const keyFile = process.env.GOOGLE_KEYFILE;

if (!spreadsheetId) {
  console.error("❌ SPREADSHEET_ID manquant dans .env");
  process.exit(1);
}
if (!keyFile) {
  console.error("❌ GOOGLE_KEYFILE manquant dans .env");
  process.exit(1);
}

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // ⚠️ Change juste le nom d’onglet ici si besoin
  const sheetName = "Historique salaires";

  // On lit les 10 premières lignes pour voir les colonnes
  const range = `${sheetName}!A1:Z10`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const rows = res.data.values || [];
  console.log(`✅ Lecture ${sheetName} (${rows.length} lignes)`);
  console.log("-----");

  for (let i = 0; i < rows.length; i++) {
    console.log(`${String(i + 1).padStart(2, "0")} |`, rows[i]);
  }
}

main().catch((err) => {
  console.error("❌ Erreur Google Sheets :", err?.message || err);
  if (err?.response?.data) console.error(err.response.data);
});
