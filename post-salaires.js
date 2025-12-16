require("dotenv").config();
const { google } = require("googleapis");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const spreadsheetId = process.env.SPREADSHEET_ID;
const keyFile = process.env.GOOGLE_KEYFILE;
const token = process.env.DISCORD_TOKEN;
const channelId = process.env.SALAIRES_CHANNEL_ID;

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

async function readSalaires() {
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

  return raw.map((r) => {
    const obj = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = r[i];
    return obj;
  });
}

function buildEmployeEmbed(weekKey, r) {
  const nom = r["Prénom et nom"] ?? "—";
  const grade = r["Grade"] ?? "—";

  const tele = r["Télégramme"] ?? "—";
  const prod = r["Quantité totale produite"] ?? "—";
  const salaire = round2(r["Salaire"]);
  const prime = round2(r["Prime"]);
  const rachat = round2(r["Total rachat"]);
  const totalPaye = round2(r["Total payé"]);
  const statut = r["Statut au moment de la clôture"] ?? "—";

  const title = `💰 ${weekKey} — ${grade} — ${nom}`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(`**Statut :** ${statut}`)
    .addFields(
      { name: "Télégramme", value: String(tele), inline: true },
      { name: "Production", value: String(prod), inline: true },
      { name: "Total payé", value: String(totalPaye), inline: true },
      { name: "Salaire", value: String(salaire), inline: true },
      { name: "Prime", value: String(prime), inline: true },
      { name: "Rachat total", value: String(rachat), inline: true }
    )
    .setFooter({ text: "LGW | Menuiserie de Strawberry — Historique salaires" });

  return embed;
}

async function main() {
  if (!token) throw new Error("DISCORD_TOKEN manquant");
  if (!channelId) throw new Error("SALAIRES_CHANNEL_ID manquant dans .env");
  if (!spreadsheetId) throw new Error("SPREADSHEET_ID manquant");
  if (!keyFile) throw new Error("GOOGLE_KEYFILE manquant");

  const items = await readSalaires();

  const weeks = [...new Set(items.map((x) => x["Semaine"]).filter(Boolean))]
    .map(String)
    .sort();

  if (weeks.length === 0) {
    console.log("❌ Aucune semaine trouvée.");
    return;
  }

  const weekKey = process.argv[2] ? String(process.argv[2]) : weeks[weeks.length - 1];
  const weekRows = items.filter((x) => String(x["Semaine"]) === weekKey);

  // tri grade + nom
  weekRows.sort((a, b) => {
    const ga = gradeRank(a["Grade"]);
    const gb = gradeRank(b["Grade"]);
    if (ga !== gb) return ga - gb;
    return String(a["Prénom et nom"] || "").localeCompare(String(b["Prénom et nom"] || ""));
  });

  // stats
  let totalSemaine = 0;
  let nbPaye = 0;
  let nbPasPaye = 0;

  for (const r of weekRows) {
    totalSemaine += Number(r["Total payé"] || 0);
    const statut = String(r["Statut au moment de la clôture"] || "").toLowerCase();
    if (statut.includes("payé") && !statut.includes("pas")) nbPaye++;
    if (statut.includes("pas payé")) nbPasPaye++;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once("ready", async () => {
    const channel = await client.channels.fetch(channelId);
    if (!channel) throw new Error("Channel salaires introuvable");

    await channel.send(
      `📌 **Salaires — ${weekKey}** | Employés: **${weekRows.length}** | Payé: **${nbPaye}** | Pas payé: **${nbPasPaye}** | Total: **${round2(
        totalSemaine
      )}$**`
    );

    for (const r of weekRows) {
      const embed = buildEmployeEmbed(weekKey, r);
      await channel.send({ embeds: [embed] });
    }

    console.log("✅ Publication terminée.");
    process.exit(0);
  });

  await client.login(token);
}

main().catch((err) => console.error("❌", err?.message || err));
