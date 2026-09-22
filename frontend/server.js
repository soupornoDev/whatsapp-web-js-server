const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const qrImage = require("qr-image");
const nodemailer = require("nodemailer");
const qrcode = require("qrcode-terminal");
const ytSearch = require("yt-search");
const fs = require("fs");
const path = require("path");

// Fix path for download-mp3 since we moved it
const downloadMp3 = require("./src/bot-src/download-mp3");

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = process.env.PORT || 3000;
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const botName = process.env.BOT_NAME || "WhatsApp Music Bot";
let currentQr = null;

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "whatsapp-bot",
  }),
  puppeteer: {
    headless: true,
    executablePath: process.env.CHROME_BIN || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  },
});

client.on("qr", async (qr) => {
  console.log("\nScan this QR code with WhatsApp:\n");
  currentQr = qr;

  qrcode.generate(qr, { small: true });

  try {
    const qrPngBuffer = qrImage.imageSync(qr, { type: "png" });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER || "your_email@gmail.com",
        pass: process.env.EMAIL_PASS || "your_app_password",
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER || "your_email@gmail.com",
      to: process.env.EMAIL_TO || "receiver_email@gmail.com",
      subject: "WhatsApp Bot QR Code",
      text: "Here is your new WhatsApp Bot login QR Code. Scan it within 1 minute.",
      attachments: [{ filename: "qrcode.png", content: qrPngBuffer }],
    };

    await transporter.sendMail(mailOptions);
    console.log("✅ QR Code sent to email successfully!");
  } catch (error) {
    console.error("❌ Failed to send QR Code email:", error.message);
  }
});

client.on("loading_screen", (percent, message) => {
  console.log(`Loading: ${percent}% - ${message}`);
});

client.on("authenticated", () => {
  currentQr = null;
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

// Start the Next.js app and the Bot
app.prepare().then(() => {
  client.initialize();

  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      const { pathname } = parsedUrl;

      // Intercept /api/qr
      if (pathname === "/api/qr") {
        // Add CORS headers for Vercel deployment
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") {
          res.writeHead(200);
          res.end();
          return;
        }

        if (currentQr) {
          const qrPngBuffer = qrImage.imageSync(currentQr, { type: "png", margin: 4, size: 10 });
          res.writeHead(200, {
            "Content-Type": "image/png",
            "Content-Length": qrPngBuffer.length,
          });
          res.end(qrPngBuffer);
        } else {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No QR Code available. Bot might be already logged in." }));
        }
        return;
      }

      // Default Next.js routing
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  }).listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
