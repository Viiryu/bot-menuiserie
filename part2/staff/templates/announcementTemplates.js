// part2/staff/templates/announcementTemplates.js
// Templates simples, tu peux en ajouter autant que tu veux.
// Variables dispo: {company}, {pay}, {interval}, {contacts}, {extra}
const ANNOUNCE_TEMPLATES = [
  {
    key: "recrutement",
    label: "🪵 Recrutement",
    title: "🪵 Menuiserie — Recrutement",
    body:
      "**La menuiserie recrute !**\n" +
      "• Salaire: **{pay}**\n" +
      "• Toutes les **{interval}**\n\n" +
      "📜 Contact: **{contacts}**",
  },
  {
    key: "commandes",
    label: "📦 Commandes",
    title: "📦 Menuiserie — Commandes",
    body:
      "**Nous prenons vos commandes !**\n" +
      "• Devis rapide, bois traité, structures\n\n" +
      "📜 Contact: **{contacts}**",
  },
  {
    key: "mix",
    label: "🔥 Mix (Recrutement + Commandes)",
    title: "🔥 Menuiserie — Recrutement & Commandes",
    body:
      "**Recrutement + Commandes**\n" +
      "• Salaire: **{pay}** (toutes les **{interval}**)\n" +
      "• Commandes ouvertes toute la journée\n\n" +
      "📜 Contact: **{contacts}**\n{extra}",
  },
  {
    key: "rp_info",
    label: "🕯️ Info RP",
    title: "🕯️ Information",
    body:
      "**Annonce RP**\n" +
      "{extra}\n\n" +
      "📜 Contact: **{contacts}**",
  },
];

function getTemplate(key) {
  return ANNOUNCE_TEMPLATES.find((t) => t.key === key) || ANNOUNCE_TEMPLATES[0];
}

module.exports = { ANNOUNCE_TEMPLATES, getTemplate };
