require("dotenv").config();
const { google } = require("googleapis");

const spreadsheetId = process.env.SPREADSHEET_ID;
const keyFile = process.env.GOOGLE_KEYFILE;

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"], // pas readonly (on écrira après)
  });
  const sheets = google.sheets({ version: "v4", auth });

  const range = `BOT_STATE!A1:H20`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];

  console.log("✅ BOT_STATE aperçu :");
  if (rows.length === 0) console.log("(vide)");
  else rows.forEach((r, i) => console.log(String(i + 1).padStart(2, "0"), r));
}

main().catch((err) => {
  console.error("❌", err?.message || err);
  if (err?.response?.data) console.error(err.response.data);
});
