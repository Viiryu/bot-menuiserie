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

  const res = await sheets.spreadsheets.get({ spreadsheetId });

  console.log("✅ Spreadsheet :", res.data.properties?.title);
  console.log("📄 Onglets :");
  for (const sh of res.data.sheets || []) {
    console.log(" -", sh.properties?.title);
  }
}

main().catch((err) => {
  console.error("❌ Erreur Google Sheets :", err?.message || err);
  if (err?.response?.data) console.error(err.response.data);
});
