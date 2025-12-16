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

function isSeparatorRow(row) {
  const first = row?.[0];
  return typeof first === "string" && first.trim().startsWith("|");
}

function round2(n) {
  if (typeof n !== "number") return n;
  return Math.round(n * 100) / 100;
}

async function main() {
  const weekArg = process.argv[2]; // optionnel : ex "2025-S50"

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const sheetName = "Historique salaires";
  const range = `${sheetName}!A1:Z2000`; // large pour être sûr

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const rows = res.data.values || [];
  if (rows.length < 2) {
    console.log("❌ Pas assez de données.");
    return;
  }

  const header = rows[0];
  const raw = rows.slice(1);

  // Nettoyage : retire les lignes décoratives
  const clean = raw.filter((r) => !isSeparatorRow(r));

  // Transforme chaque ligne en objet basé sur l'en-tête
  const items = clean.map((r) => {
    const obj = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = r[i];
    return obj;
  });

  // Liste des semaines dispo
  const weeks = [...new Set(items.map((x) => x["Semaine"]).filter(Boolean))]
    .map(String)
    .sort();

  console.log("✅ Semaines trouvées :", weeks.join(", ") || "(aucune)");
  if (weeks.length === 0) return;

  // Semaine choisie : argument ou dernière (la plus récente)
  const weekKey = weekArg ? String(weekArg) : weeks[weeks.length - 1];
  const weekRows = items.filter((x) => String(x["Semaine"]) === weekKey);

  console.log(`\n📌 Lecture semaine : ${weekKey}`);
  console.log(`📄 Lignes : ${weekRows.length}\n`);

  // Affichage lisible
  for (const r of weekRows) {
    const nom = r["Prénom et nom"] ?? "—";
    const grade = r["Grade"] ?? "—";
    const totalPaye = round2(r["Total payé"]);
    const statut = r["Statut au moment de la clôture"] ?? "—";
    console.log(`- ${grade} | ${nom} | Total payé: ${totalPaye} | Statut: ${statut}`);
  }
}

main().catch((err) => {
  console.error("❌ Erreur :", err?.message || err);
  if (err?.response?.data) console.error(err.response.data);
});
