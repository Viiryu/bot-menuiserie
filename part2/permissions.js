const { getConfig } = require("./configStore");

// Vérifie si un membre a au moins un rôle dans la liste
function hasAnyRole(member, roleIds) {
  if (!member?.roles?.cache) return false;
  return roleIds.some((id) => member.roles.cache.has(id));
}

async function isStaff(member) {
  const cfg = await getConfig();
  return hasAnyRole(member, cfg.staffRoleIds || []);
}

async function isCompta(member) {
  const cfg = await getConfig();
  return hasAnyRole(member, cfg.comptaRoleIds || []);
}

module.exports = { hasAnyRole, isStaff, isCompta };
