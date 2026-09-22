import next from "next";
import qrImage from "qr-image";
import nodemailer from "nodemailer";
import qrcode from "qrcode-terminal";
import ytSearch from "yt-search";
import fs from "fs";
import path from "path";

// ES Module imports replacing CommonJS require()
import downloadMp3 from "./src/bot-src/download-mp3.js";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia } = pkg;

export default function wwjsBot() {
  /* const dev = process.env.NODE_ENV !== "production";
  const hostname = dev ? "localhost" : "0.0.0.0";
  const port = parseInt(process.env.PORT, 10) || 3000;
  */
  const botName = process.env.BOT_NAME || "WhatsApp Music Bot";

  // ========================================
  // WhatsApp Web Client Setup
  // ========================================

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: "whatsapp-bot",
    }),
    puppeteer: {
      headless: true,
      executablePath: process.env.CHROME_BIN || process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-gpu",
      ],
    },
  });

  client.on("qr", async (qr) => {
    console.log("\nScan this QR code with WhatsApp:\n");

    qrcode.generate(qr, { small: true });

    try {
      const qrPngBuffer = qrImage.imageSync(qr, { type: "png" });

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_TO || process.env.EMAIL_USER,
        subject: "WhatsApp Bot QR Code",
        text: "Here is your new WhatsApp Bot login QR Code. Scan it within 1 minute.",
        attachments: [{ filename: "qrcode.png", content: qrPngBuffer }],
      };

      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        await transporter.sendMail(mailOptions);
        console.log("✅ QR Code sent to email successfully!");
      }
    } catch (error) {
      console.error("❌ Failed to send QR Code email:", error.message);
    }
  });

  client.on("loading_screen", (percent, message) => {
    console.log(`Loading: ${percent}% - ${message}`);
  });

  client.on("authenticated", () => {
    console.log("✅ WhatsApp authenticated successfully.");
  });

  client.on("auth_failure", (message) => {
    console.error("❌ Authentication failed:", message);
  });

  const startTime = Date.now();

  client.on("ready", () => {
    console.log("\n=================================");
    console.log(`       ${botName} Ready`);
    console.log("=================================");
    console.log("Commands:");
    console.log(" .menu / .help  - Show menu");
    console.log(" .play <song>   - Play a song");
    console.log(" .tagall        - Tag everyone in group");
    console.log(" .ping          - Check availability");
    console.log(" .status        - Show uptime");
    console.log("=================================\n");
  });

  client.on("disconnected", (reason) => {
    console.log("⚠️ WhatsApp disconnected:", reason);
  });

  // ========================================
  // Message Handling Logic
  // ========================================

  client.on("message_create", async (msg) => {
    try {
      const body = msg.body.trim();
      if (!body.startsWith(".")) return;

      const isGroup = msg.from.endsWith("@g.us") || (msg.fromMe && msg.to && msg.to.endsWith("@g.us"));
      if (!isGroup) return;

      const chatId = msg.from.endsWith("@g.us") ? msg.from : msg.to;
      const lowerBody = body.toLowerCase();

      if (lowerBody === ".ping") {
        await msg.reply("pong");
        return;
      }

      if (lowerBody === ".status") {
        const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
        const hours = Math.floor(uptimeSec / 3600);
        const minutes = Math.floor((uptimeSec % 3600) / 60);
        const seconds = uptimeSec % 60;
        await msg.reply(`*Uptime:* ${hours}h ${minutes}m ${seconds}s`);
        return;
      }

      if (lowerBody === ".menu" || lowerBody === ".help") {
        const menuText = `*${botName}*\n\n*Commands:*\n*.menu* or *.help* - Display this menu\n*.play <song name>* - Search YouTube and send as MP3\n*.tagall* - Tag everyone in the group\n*.ping* - Check bot availability\n*.status* - Show uptime\n\n_Downloads are limited to 15 mins and 20 MB._`;
        await msg.reply(menuText);
        return;
      }

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
          const stats = fs.statSync(filePath);
          const sizeMB = stats.size / (1024 * 1024);
          if (sizeMB > 20) {
            await msg.react("❌");
            await msg.reply(`❌ File is too large (${sizeMB.toFixed(2)} MB). Limit is 20 MB.`);
            return;
          }

          await msg.react("✅");

          const media = MessageMedia.fromFilePath(filePath);
          try {
            await msg.reply(media);
          } catch (replyErr) {
            console.warn("msg.reply failed, falling back to client.sendMessage:", replyErr.message);
            await client.sendMessage(chatId, media);
          }
        } finally {
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

  client.initialize();
}