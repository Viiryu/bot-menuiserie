/**
 * part2/modules/tickets.js
 *
 * - publishTicketPanel(interaction, channelId?)
 * - handleTicketButton(interaction)
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const { TICKETS_IDS } = require("./ids");
const { getGuildConfig } = require("../config/configStore");
const { isStaff } = require("../permissions");

function clamp(s, n) {
  const str = String(s ?? "");
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

async function resolveTextChannel(interaction, channelId) {
  const id = channelId || interaction.channelId;
  if (!id) return null;
  try {
    const ch = await interaction.client.channels.fetch(id);
    if (ch?.isTextBased?.()) return ch;
  } catch {}
  return null;
}

function buildTicketPanel() {
  const embed = new EmbedBuilder()
    .setTitle("🎫 Support — Tickets")
    .setDescription(
      [
        "Besoin d'aide ? Ouvre un ticket.",
        "Un staff te répondra dès que possible.",
        "",
        "⚠️ Merci d'être clair et respectueux.",
      ].join("\n")
    )
    .setTimestamp(new Date());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(TICKETS_IDS.PANEL_OPEN)
      .setLabel("Ouvrir un ticket")
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

async function publishTicketPanel(interaction, channelId) {
  const ch = await resolveTextChannel(interaction, channelId);
  if (!ch) throw new Error("Salon invalide pour publier le panel tickets.");
  const payload = buildTicketPanel();
  const msg = await ch.send(payload);
  return msg;
}

async function findExistingTicketChannel(guild, userId) {
  const channels = guild.channels.cache?.values?.() ? [...guild.channels.cache.values()] : [];
  for (const ch of channels) {
    if (!ch || ch.type !== ChannelType.GuildText) continue;
    if (ch.topic && String(ch.topic).includes(`ticket:${userId}`)) return ch;
  }
  return null;
}

async function createTicketChannel(interaction) {
  const guild = interaction.guild;
  const user = interaction.user;
  const cfg = getGuildConfig(guild.id);

  const existing = await findExistingTicketChannel(guild, user.id);
  if (existing) return { channel: existing, created: false };

  const everyoneId = guild.roles.everyone.id;
  const staffRoleIds = (cfg.staffRoleIds || []).filter(Boolean);

  const overwrites = [
    {
      id: everyoneId,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];

  for (const rid of staffRoleIds) {
    overwrites.push({
      id: rid,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  const parent = cfg.ticketCategoryId || null;

  const ticketName = `ticket-${user.username}`
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .slice(0, 90);

  const channel = await guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    parent: parent || undefined,
    topic: `ticket:${user.id}`,
    permissionOverwrites: overwrites,
  });

  return { channel, created: true };
}

function buildTicketHeader(user) {
  const embed = new EmbedBuilder()
    .setTitle("🎫 Ticket ouvert")
    .setDescription(
      [
        `👤 Demandeur : <@${user.id}>`,
        "", 
        "Décris ton problème ici.",
        "Le staff te répondra." ,
      ].join("\n")
    )
    .setTimestamp(new Date());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(TICKETS_IDS.TICKET_CLOSE)
      .setLabel("Fermer")
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row] };
}

async function handleTicketButton(interaction) {
  if (!interaction.isButton()) return false;
  const id = interaction.customId;

  if (id === TICKETS_IDS.PANEL_OPEN) {
    if (!interaction.guild) return false;

    await interaction.deferReply({ ephemeral: true });

    const { channel, created } = await createTicketChannel(interaction);

    if (created) {
      await channel.send(buildTicketHeader(interaction.user));
    }

    return interaction.editReply(
      created
        ? `✅ Ticket créé : ${channel}`
        : `ℹ️ Tu as déjà un ticket ouvert : ${channel}`
    );
  }

  if (id === TICKETS_IDS.TICKET_CLOSE) {
    const guild = interaction.guild;
    if (!guild) return false;

    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    const staff = isStaff(member);

    // Owner: topic ticket:userId
    const topic = String(interaction.channel?.topic || "");
    const ownerId = (topic.match(/ticket:(\d+)/) || [])[1] || null;
    const isOwner = ownerId && ownerId === interaction.user.id;

    if (!staff && !isOwner) {
      await interaction.reply({
        content: "⛔ Seul le staff ou le propriétaire du ticket peut fermer.",
        ephemeral: true,
      });
      return true;
    }

    await interaction.reply({ content: "🗑️ Fermeture du ticket…", ephemeral: true });

    const ch = interaction.channel;
    try {
      await ch.setName(clamp(`ferme-${ch.name}`.toLowerCase(), 90));
    } catch {}

    setTimeout(() => {
      ch.delete("Ticket fermé").catch(() => {});
    }, 1500);

    return true;
  }

  return false;
}

module.exports = { publishTicketPanel, handleTicketButton };
