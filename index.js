const {
  Client,
  LocalAuth,
  MessageMedia,
} = require("whatsapp-web.js");

const qrcode = require("qrcode-terminal");
const ytSearch = require("yt-search");
const downloadMp3 = require("./src/download-mp3");
const fs = require("fs");

const botName = process.env.BOT_NAME || "WhatsApp Music Bot";

// ========================================
// WhatsApp Client
// ========================================

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "whatsapp-bot",
  }),

  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  },
});

// ========================================
// QR Code
// ========================================

client.on("qr", (qr) => {
  console.log("\nScan this QR code with WhatsApp:\n");

  qrcode.generate(qr, {
    small: true,
  });
});

// ========================================
// Loading
// ========================================

client.on("loading_screen", (percent, message) => {
  console.log(`Loading: ${percent}% - ${message}`);
});

// ========================================
// Authenticated
// ========================================

client.on("authenticated", () => {
  console.log("✅ WhatsApp authenticated successfully.");
});

// ========================================
// Auth Failure
// ========================================

client.on("auth_failure", (message) => {
  console.error("❌ Authentication failed:", message);
});

// ========================================
// Ready
// ========================================

const startTime = Date.now();

client.on("ready", () => {
  console.log("\n=================================");
  console.log(`       ${botName} Ready`);
  console.log("=================================");
  console.log("Commands:");
  console.log(" .menu / .help  - Show menu");
  console.log(" .play <song>   - Play a song");
  console.log(" .ping          - Check availability");
  console.log(" .status        - Show uptime");
  console.log("=================================\n");
});

// ========================================
// Disconnected
// ========================================

client.on("disconnected", (reason) => {
  console.log("⚠️ WhatsApp disconnected:", reason);
});

// ========================================
// Message Handler
// ========================================

client.on("message_create", async (msg) => {
  try {
    const body = msg.body.trim();

    // Commands only
    if (!body.startsWith(".")) return;

    // Check if group (handles both messages from other members and from the bot account)
    const isGroup = msg.from.endsWith('@g.us') || (msg.fromMe && msg.to && msg.to.endsWith('@g.us'));
    if (!isGroup) {
      return;
    }

    const chatId = msg.from.endsWith('@g.us') ? msg.from : msg.to;
    const lowerBody = body.toLowerCase();

    // 1. .ping
    if (lowerBody === ".ping") {
      await msg.reply("pong");
      return;
    }

    // 2. .status
    if (lowerBody === ".status") {
      const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
      const hours = Math.floor(uptimeSec / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);
      const seconds = uptimeSec % 60;
      await msg.reply(`*Uptime:* ${hours}h ${minutes}m ${seconds}s`);
      return;
    }

    // 3. .menu or .help
    if (lowerBody === ".menu" || lowerBody === ".help") {
      const menuText = `*${botName}*

*Commands:*
*.menu* or *.help* - Display this menu
*.play <song name>* - Search YouTube and send as MP3
*.tagall* - Tag everyone in the group
*.ping* - Check bot availability
*.status* - Show uptime

_Downloads are limited to 15 mins and 20 MB._`;
      await msg.reply(menuText);
      return;
    }

    // 4. .tagall
    if (lowerBody === ".tagall") {
      try {
        const chat = await msg.getChat();
        if (!chat.isGroup) return;

        let text = "";
        let mentions = [];

        for (let participant of chat.participants) {
          mentions.push(participant.id._serialized);
          text += `@${participant.id.user} `;
        }

        await chat.sendMessage(text, { mentions });
      } catch (err) {
        console.error("Tagall error:", err);
        await msg.reply("❌ Failed to tag all members.");
      }
      return;
    }

    // 5. .play
    if (lowerBody.startsWith(".play")) {
      const songName = body.slice(5).trim();
      if (!songName) {
        await msg.reply("❌ Usage: .play <song name>");
        return;
      }

      console.log(`Searching for: ${songName}`);
      await msg.react("🔍");

      const searchResults = await ytSearch(songName);
      if (!searchResults || !searchResults.videos || searchResults.videos.length === 0) {
        await msg.react("❌");
        await msg.reply("❌ Song not found.");
        return;
      }

      const song = searchResults.videos[0];
      
      // Limit to 15 minutes
      if (song.duration.seconds > 15 * 60) {
        await msg.react("❌");
        await msg.reply(`❌ Song is too long (${song.duration.timestamp}). Limit is 15 minutes.`);
        return;
      }

      await msg.react("⬇️");
      
      let filePath;
      try {
        filePath = await downloadMp3(song.url);
      } catch (err) {
        console.error("Download error:", err);
        await msg.react("❌");
        await msg.reply("❌ Failed to download the song.");
        return;
      }

      try {
        // Check file size (20 MB limit)
        const stats = fs.statSync(filePath);
        const sizeMB = stats.size / (1024 * 1024);
        if (sizeMB > 20) {
          await msg.react("❌");
          await msg.reply(`❌ File is too large (${sizeMB.toFixed(2)} MB). Limit is 20 MB.`);
          return;
        }

        await msg.react("✅");

        const media = MessageMedia.fromFilePath(filePath);
        
        // Send MP3 to the group chat
        try {
          await msg.reply(media);
        } catch (replyErr) {
          console.warn("msg.reply failed, falling back to client.sendMessage:", replyErr.message);
          await client.sendMessage(chatId, media);
        }
      } finally {
        // Clean up the downloaded MP3 file
        if (filePath && fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (cleanupErr) {
            console.error("Cleanup error:", cleanupErr);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error processing message:", error);
  }
});

// ========================================
// Initialize
// ========================================

client.initialize();