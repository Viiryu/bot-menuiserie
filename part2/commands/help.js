const { EmbedBuilder } = require("discord.js");
const { isStaff, isCompta } = require("../permissions");

const HELP = [
  { name: "/help", cat: "Général", access: "ALL", desc: "Affiche l’aide (ephemeral)" },

  { name: "/purge", cat: "Modération", access: "STAFF", desc: "Supprimer des messages" },
  { name: "/ban", cat: "Modération", access: "STAFF", desc: "Ban + delete 0–7 jours" },

  { name: "/say text", cat: "Communication", access: "STAFF", desc: "Message classique (Modal)" },
  { name: "/say embed", cat: "Communication", access: "STAFF", desc: "Embed stylé (Modal)" },

  { name: "/automod setup", cat: "AutoMod", access: "STAFF", desc: "Configurer l’automod (Modal)" },

  // Compta (juste listé)
  { name: "/link", cat: "Compta", access: "ALL", desc: "Lier employé ↔ Discord" },
  { name: "/pay /unpay /sync...", cat: "Compta", access: "COMPTA", desc: "Commandes compta (réservées)" },
];

async function canUse(member, access) {
  if (access === "ALL") return true;
  if (access === "STAFF") return await isStaff(member);
  if (access === "COMPTA") return await isCompta(member);
  return false;
}

async function run(interaction) {
  const byCat = new Map();

  for (const c of HELP) {
    const ok = await canUse(interaction.member, c.access);
    const badge = ok ? "✅" : "🔒";
    const roleTxt = c.access === "ALL" ? "Tout le monde" : (c.access === "STAFF" ? "Staff" : "Compta");

    const line = `${badge} **${c.name}** — ${c.desc} _(Requis : ${roleTxt})_`;

    if (!byCat.has(c.cat)) byCat.set(c.cat, []);
    byCat.get(c.cat).push(line);
  }

  const embed = new EmbedBuilder()
    .setTitle("📌 Aide — Commandes du bot")
    .setDescription("🔒 = réservé selon tes rôles (Patron/Co-Patronne).")
    .setTimestamp(new Date());

  for (const [cat, lines] of byCat) {
    embed.addFields({ name: cat, value: lines.join("\n").slice(0, 1024) });
  }

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral
 });
}

module.exports = { name: "help", run };
