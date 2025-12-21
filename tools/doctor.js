// tools/doctor.js
// "Doctor" local: check rapidement que Part2 exports/IDs/commands sont OK.
// Usage: node tools/doctor.js

require('dotenv').config();

function collectStringIssues(obj, prefix = '') {
  const bad = [];
  const walk = (o, p) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      const path = p ? `${p}.${k}` : k;
      if (typeof v === 'string') {
        if (!v.length) bad.push({ path, value: v });
      } else if (v && typeof v === 'object') {
        walk(v, path);
      } else {
        bad.push({ path, value: v });
      }
    }
  };
  walk(obj, prefix);
  return bad;
}

function checkIds(mod, label) {
  const issues = collectStringIssues(mod);
  const total = (() => {
    let c = 0;
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      for (const v of Object.values(o)) {
        if (typeof v === 'string') c += 1;
        else if (v && typeof v === 'object') walk(v);
      }
    };
    walk(mod);
    return c;
  })();

  if (issues.length) {
    console.log(`❌ ${label}: ${issues.length} valeur(s) invalide(s) (doivent être des string non vides)`);
    for (const it of issues.slice(0, 40)) {
      console.log(`   - ${it.path} =`, it.value);
    }
  } else {
    console.log(`✅ ${label}: OK (${total} ids)`);
  }
}

console.log('🩺 LGW Doctor\n');

try {
  const cmdIndex = require('../part2/commands');
  console.log('part2/commands exports keys:', Object.keys(cmdIndex));

  const list = cmdIndex.COMMANDS || null;
  if (Array.isArray(list)) console.log(`✅ part2/commands.COMMANDS est un Array (${list.length})`);
  else console.log('⚠️ part2/commands.COMMANDS absent (ok si vous utilisez listCommands/loadCommands)');

  if (typeof cmdIndex.listCommands === 'function') {
    const names = cmdIndex.listCommands().map((c) => `/${c.name}`).sort();
    console.log(`✅ listCommands(): ${names.length} -> ${names.join(', ')}`);
  } else {
    console.log('⚠️ listCommands() absent');
  }
} catch (e) {
  console.log('❌ Impossible de require part2/commands:', e?.message || e);
}

for (const [label, path] of [
  ['part2/staff/ids', '../part2/staff/ids'],
  ['part2/say/ids', '../part2/say/ids'],
  ['part2/modules/ids', '../part2/modules/ids']
]) {
  try {
    const mod = require(path);
    checkIds(mod, label);
  } catch (e) {
    console.log(`⚠️ ${label} non lu:`, e?.message || e);
  }
}

console.log('\n✅ Doctor terminé.');
