/**
 * part2/permissions.js
 *
 * Règle: staff si Admin OU possède un des rôles staffRoleIds (config part2).
 */

const { getGuildConfig } = require("./config/configStore");

function isStaff(member) {
  try {
    if (!member) return false;
    if (member.permissions?.has?.("Administrator")) return true;
    if (member.permissions?.has?.("ManageGuild")) return true;

    const cfg = getGuildConfig(member.guild?.id);
    const staffRoleIds = Array.isArray(cfg?.staffRoleIds) ? cfg.staffRoleIds : [];
    if (!staffRoleIds.length) return false;

    const roles = member.roles?.cache;
    if (!roles) return false;
    return staffRoleIds.some((id) => roles.has(id));
  } catch {
    return false;
  }
}

module.exports = { isStaff };
