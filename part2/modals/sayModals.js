// part2/modals/sayModals.js
// ✅ Robust handler: always ACK the modal, supports basic text + basic embed publish

const { EmbedBuilder } = require('discord.js');
const { SAY_IDS } = require('../say/ids');

function isSayModal(customId) {
  if (!customId) return false;
  return (
    customId === SAY_IDS.MODAL_TEXT ||
    customId === SAY_IDS.MODAL_EMBED_BASIC ||
    customId === SAY_IDS.MODAL_EMBED_MEDIA ||
    customId === SAY_IDS.MODAL_ACTIONS ||
    (typeof customId === 'string' && customId.startsWith('P2_SAY_') && customId.includes('MODAL'))
  );
}

function safeGetField(interaction, key) {
  try {
    return interaction.fields.getTextInputValue(key);
  } catch {
    return null;
  }
}

function parseColor(value) {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;
  const hex = v.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return parseInt(hex, 16);
}

function pickByHeuristic(fieldsMap, matcher) {
  for (const [id, val] of Object.entries(fieldsMap)) {
    if (matcher(id)) return val;
  }
  return null;
}

async function handleSayModals(interaction) {
  if (!interaction.isModalSubmit?.()) return false;
  if (!isSayModal(interaction.customId)) return false;

  try {
    // Always ACK quickly to avoid "échec de l'interaction"
    await interaction.deferReply({ flags: 64 }).catch(() => {});

    const channel = interaction.channel;
    if (!channel || !channel.send) {
      await interaction.editReply('❌ Impossible: je ne vois pas le salon où publier.').catch(() => {});
      return true;
    }

    // Build a generic map of modal inputs (id -> value)
    const fieldsMap = {};
    for (const f of interaction.fields.fields.values()) {
      fieldsMap[f.customId] = f.value;
    }

    // TEXT modal
    if (interaction.customId === SAY_IDS.MODAL_TEXT || interaction.customId.includes('TEXT')) {
      const content = pickByHeuristic(fieldsMap, (id) => /text|message|content/i.test(id))
        ?? safeGetField(interaction, 'text')
        ?? safeGetField(interaction, 'message');

      if (!content || !String(content).trim()) {
        await interaction.editReply('❌ Texte vide.').catch(() => {});
        return true;
      }

      await channel.send({ content: String(content) });
      await interaction.editReply('✅ Message envoyé.').catch(() => {});
      return true;
    }

    // EMBED modal (basic/media)
    const title = pickByHeuristic(fieldsMap, (id) => /title/i.test(id));
    const description = pickByHeuristic(fieldsMap, (id) => /desc|description/i.test(id));
    const footer = pickByHeuristic(fieldsMap, (id) => /footer/i.test(id));
    const colorRaw = pickByHeuristic(fieldsMap, (id) => /color|couleur/i.test(id));
    const image = pickByHeuristic(fieldsMap, (id) => /image/i.test(id));
    const thumbnail = pickByHeuristic(fieldsMap, (id) => /thumb/i.test(id));

    const embed = new EmbedBuilder();
    if (title) embed.setTitle(String(title).slice(0, 256));
    if (description) embed.setDescription(String(description).slice(0, 4000));
    const color = parseColor(colorRaw);
    if (color != null) embed.setColor(color);
    if (footer) embed.setFooter({ text: String(footer).slice(0, 2048) });
    if (thumbnail && /^https?:\/\//i.test(String(thumbnail))) embed.setThumbnail(String(thumbnail));
    if (image && /^https?:\/\//i.test(String(image))) embed.setImage(String(image));

    await channel.send({ embeds: [embed] });
    await interaction.editReply('✅ Embed envoyé.').catch(() => {});
    return true;
  } catch (e) {
    console.error('[sayModals] error:', e?.stack || e);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('❌ Erreur interne /say (voir console).').catch(() => {});
      } else {
        await interaction.reply({ content: '❌ Erreur interne /say (voir console).', flags: 64 }).catch(() => {});
      }
    } catch {}
    return true;
  }
}

module.exports = { handleSayModals };
