// Coupe un texte trop long (Discord limite les champs d'embed)
function cut(str, max = 1024) {
  if (!str) return "";
  const s = String(str);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// Convertit une couleur "ff8800" ou "#ff8800" en nombre (pour Discord)
function parseHexColor(input) {
  if (!input) return null;
  let s = String(input).trim();
  if (s.startsWith("#")) s = s.slice(1);
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return parseInt(s, 16);
}

// Convertit "30m" "6h" "1d" "45s" -> secondes
function parseEvery(input) {
  if (!input) return null;
  const m = String(input).trim().match(/^(\d+)\s*([smhd])$/i);
  if (!m) return null;

  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (!Number.isFinite(n) || n <= 0) return null;

  const mult = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
  return n * mult;
}

// Mentions sécurisées (empêche @everyone/@here par défaut)
function safeAllowedMentions({ allowUsers = true, allowRoles = false, allowEveryone = false } = {}) {
  const parse = [];
  if (allowUsers) parse.push("users");
  if (allowRoles) parse.push("roles");
  if (allowEveryone) parse.push("everyone");
  return { parse };
}

module.exports = { cut, parseHexColor, parseEvery, safeAllowedMentions };
