require("dotenv").config();
const { google } = require("googleapis");

const spreadsheetId = process.env.SPREADSHEET_ID;
const keyFile = process.env.GOOGLE_KEYFILE;

function gsDateToISO(serial) {
  // Google Sheets date serial -> JS Date
  // 25569 = nb de jours entre 1899-12-30 et 1970-01-01
  if (typeof serial !== "number") return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  // format YYYY-MM-DD
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const sheetName = "Historique salaires";
  const range = `${sheetName}!A1:Z200`; // on lit large pour tester

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const rows = res.data.values || [];
  if (rows.length < 2) {
    console.log("❌ Pas assez de lignes.");
    return;
  }

  const header = rows[0];
  const dataRows = rows.slice(1);

  // on enlève les séparateurs type "|====== ... ======|" et "FIN ..."
  const clean = dataRows.filter((r) => {
    const first = r?.[0];
    return !(typeof first === "string" && first.trim().startsWith("|"));
  });

  // transforme chaque ligne en objet
  const items = clean.map((r) => {
    const obj = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = r[i];

    return {
      semaine: obj["Semaine"],
      cloture: gsDateToISO(obj["Date de clôture"]),
      nom: obj["Prénom et nom"],
      grade: obj["Grade"],
      telegramme: obj["Télégramme"],
      qte: obj["Quantité totale produite"],
      salaire: round2(obj["Salaire"]),
      prime: round2(obj["Prime"]),
      totalRachat: round2(obj["Total rachat"]),
      montantRachat: round2(obj["Montant rachat"]),
      totalPaye: round2(obj["Total payé"]),
      statut: obj["Statut au moment de la clôture"],
    };
  });

  // tri : semaine puis grade puis nom
  items.sort((a, b) => {
    if (a.semaine !== b.semaine) return String(a.semaine).localeCompare(String(b.semaine));
    const ga = gradeRank(a.grade);
    const gb = gradeRank(b.grade);
    if (ga !== gb) return ga - gb;
    return String(a.nom).localeCompare(String(b.nom));
  });

  console.log(`✅ ${items.length} lignes salaires propres`);
  console.log("----- Aperçu -----");
  for (const it of items.slice(0, 10)) {
    console.log(
      `${it.semaine} | ${it.grade} | ${it.nom} | Total payé: ${it.totalPaye} | Statut: ${it.statut} | Clôture: ${it.cloture}`
    );
  }
}

main().catch((err) => {
  console.error("❌ Erreur :", err?.message || err);
  if (err?.response?.data) console.error(err.response.data);
});
