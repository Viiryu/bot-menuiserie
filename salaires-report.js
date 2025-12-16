require("dotenv").config();
const { google } = require("googleapis");

const spreadsheetId = process.env.SPREADSHEET_ID;
const keyFile = process.env.GOOGLE_KEYFILE;

function isSeparatorRow(row) {
  const first = row?.[0];
  return typeof first === "string" && first.trim().startsWith("|");
}

function round2(n) {
  if (typeof n !== "number") return n;
  return Math.round(n * 100) / 100;
}

function gradeRank(grade) {
  const order = ["Patron", "Co-Patron", "Contremaître", "Employé", "Apprenti"];
  const idx = order.indexOf(String(grade || ""));
  return idx === -1 ? 999 : idx;
}

async function main() {
  const weekArg = process.argv[2]; // ex: 2025-S50

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const sheetName = "Historique salaires";
  const range = `${sheetName}!A1:Z2000`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const rows = res.data.values || [];
  const header = rows[0];
  const raw = rows.slice(1).filter((r) => !isSeparatorRow(r));

  const items = raw.map((r) => {
    const obj = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = r[i];
    return obj;
  });

  const weeks = [...new Set(items.map((x) => x["Semaine"]).filter(Boolean))]
    .map(String)
    .sort();

  if (weeks.length === 0) {
    console.log("❌ Aucune semaine trouvée.");
    return;
  }

  const weekKey = weekArg ? String(weekArg) : weeks[weeks.length - 1];
  const weekRows = items.filter((x) => String(x["Semaine"]) === weekKey);

  // Tri par grade puis nom
  weekRows.sort((a, b) => {
    const ga = gradeRank(a["Grade"]);
    const gb = gradeRank(b["Grade"]);
    if (ga !== gb) return ga - gb;
    return String(a["Prénom et nom"] || "").localeCompare(String(b["Prénom et nom"] || ""));
  });

  // Stats
  let totalSemaine = 0;
  let nbPaye = 0;
  let nbPasPaye = 0;

  for (const r of weekRows) {
    const total = Number(r["Total payé"] || 0);
    totalSemaine += total;
    const statut = String(r["Statut au moment de la clôture"] || "").toLowerCase();
    if (statut.includes("payé") && !statut.includes("pas")) nbPaye++;
    if (statut.includes("pas payé")) nbPasPaye++;
  }

  console.log(`📌 Rapport salaires — ${weekKey}`);
  console.log(`👥 Employés: ${weekRows.length} | Payé: ${nbPaye} | Pas payé: ${nbPasPaye}`);
  console.log(`💵 Total semaine (Total payé): ${round2(totalSemaine)}\n`);

  // Affichage “bloc par employé”
  for (const r of weekRows) {
    const nom = r["Prénom et nom"] ?? "—";
    const grade = r["Grade"] ?? "—";
    const tele = r["Télégramme"] ?? "—";
    const prod = r["Quantité totale produite"] ?? "—";
    const salaire = round2(r["Salaire"]);
    const prime = round2(r["Prime"]);
    const rachat = round2(r["Total rachat"]);
    const totalPaye = round2(r["Total payé"]);
    const statut = r["Statut au moment de la clôture"] ?? "—";

    console.log(`=== ${grade} — ${nom} ===`);
    console.log(`Télégramme: ${tele} | Prod: ${prod}`);
    console.log(`Salaire: ${salaire} | Prime: ${prime} | Rachat: ${rachat}`);
    console.log(`TOTAL PAYÉ: ${totalPaye} | Statut: ${statut}\n`);
  }
}

main().catch((err) => {
  console.error("❌ Erreur :", err?.message || err);
  if (err?.response?.data) console.error(err.response.data);
});
