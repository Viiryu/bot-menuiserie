require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const logsChannelId = process.env.LOGS_CHANNEL_ID;

if (!token) {
  console.error("❌ DISCORD_TOKEN manquant dans .env");
  process.exit(1);
}
if (!logsChannelId) {
  console.error("❌ LOGS_CHANNEL_ID manquant dans .env");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const { Events } = require("discord.js");
// ...
client.once(Events.ClientReady, async () => {

  console.log(`✅ Connecté en tant que ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(logsChannelId);
    await channel.send("✅ Bot démarré avec succès (test Étape 2).");
    console.log("✅ Message envoyé dans #logs");
  } catch (err) {
    console.error("❌ Impossible d’envoyer le message dans #logs :", err);
  }
});

client.login(token);
