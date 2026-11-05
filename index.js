const fs = require("fs");
const path = require("path");
const http = require("http");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const qrImage = require("qr-image");
const nodemailer = require("nodemailer");
const qrcode = require("qrcode-terminal");
const ytSearch = require("yt-search");

const {
  Client,
  LocalAuth,
  MessageMedia,
} = require("whatsapp-web.js");

const downloadMp3 = require("./bot-src/download-mp3");

// ==========================================
// CONFIG
// ==========================================

const botName = (process.env.BOT_NAME || "WhatsApp Music Bot").trim();

const emailUser = (
  process.env.EMAIL_USER ||
  process.env.GMAIL_USER ||
  ""
).trim();

const emailPass = (
  process.env.EMAIL_PASS ||
  process.env.GMAIL_APP_PASSWORD ||
  ""
).replace(/["'\s]/g, "");

const emailTo = (
  process.env.EMAIL_TO ||
  process.env.TO_EMAIL ||
  emailUser
).trim();

const PORT = parseInt(process.env.PORT, 10) || 3000;
const MAX_DURATION_SECONDS = 15 * 60;
const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES =
  MAX_FILE_SIZE_MB * 1024 * 1024;

let currentQr = null;
const startTime = Date.now();

// Persistent session folder (supports Render Persistent Disk via DATA_PATH)
const authDataPath =
  process.env.DATA_PATH ||
  process.env.SESSION_DIR ||
  path.join(__dirname, ".wwebjs_auth");

// Helper to safely react without breaking execution if reactions fail
const safeReact = async (msg, emoji) => {
  try {
    if (msg && typeof msg.react === "function") {
      await msg.react(emoji);
    }
  } catch (err) {
    // Reactions are non-essential; ignore errors so message processing continues
  }
};

// ==========================================
// HTTP SERVER (RENDER HEALTH CHECK & WEB QR)
// ==========================================

const server = http.createServer((req, res) => {
  const url = req.url ? req.url.split("?")[0] : "/";

  // Health check endpoint for Render monitoring
  if (url === "/" || url === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptimeSec / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const seconds = uptimeSec % 60;

    return res.end(
      JSON.stringify({
        status: "ok",
        bot: botName,
        whatsappStatus: client.info
          ? "ready"
          : currentQr
          ? "waiting_for_qr"
          : "initializing",
        uptime: `${hours}h ${minutes}m ${seconds}s`,
        hasQr: !!currentQr,
        qrUrl: currentQr ? "/qr" : null,
      })
    );
  }

  // QR Code Image (raw PNG)
  if (url === "/qr.png") {
    if (currentQr) {
      try {
        const qrPngBuffer = qrImage.imageSync(currentQr, { type: "png" });
        res.writeHead(200, {
          "Content-Type": "image/png",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        });
        return res.end(qrPngBuffer);
      } catch (e) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        return res.end("Error generating QR image");
      }
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("QR Code not available or client is already authenticated.");
    }
  }

  // QR Web Page for convenient phone scanning in browser
  if (url === "/qr") {
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    });

    if (client.info) {
      return res.end(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>${botName} - Online</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #fff; text-align: center; }
            .card { background: #1e293b; padding: 2.5rem 2rem; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); max-width: 420px; width: 90%; }
            h1 { color: #22c55e; margin: 0 0 1rem 0; font-size: 1.8rem; }
            p { color: #94a3b8; line-height: 1.5; margin: 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>✅ Bot Online</h1>
            <p><strong>${botName}</strong> is authenticated and actively listening for commands!</p>
          </div>
        </body>
        </html>
      `);
    } else if (currentQr) {
      return res.end(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>${botName} - Scan QR Code</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <meta http-equiv="refresh" content="20">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #fff; text-align: center; }
            .card { background: #1e293b; padding: 2rem; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); max-width: 420px; width: 90%; }
            h1 { color: #38bdf8; margin: 0 0 0.5rem 0; font-size: 1.6rem; }
            p { color: #94a3b8; font-size: 0.95rem; margin: 0.5rem 0 1rem 0; }
            img { background: #fff; padding: 12px; border-radius: 12px; width: 250px; height: 250px; display: block; margin: 0 auto; }
            .badge { display: inline-block; background: #334155; color: #cbd5e1; padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; margin-top: 1rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Scan with WhatsApp</h1>
            <p>Open WhatsApp &gt; Settings &gt; Linked Devices &gt; Link a Device</p>
            <img src="/qr.png?t=${Date.now()}" alt="WhatsApp QR Code" />
            <br />
            <span class="badge">🔄 Auto-refreshes every 20 seconds</span>
          </div>
        </body>
        </html>
      `);
    } else {
      return res.end(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>${botName} - Starting</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <meta http-equiv="refresh" content="5">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #fff; text-align: center; }
            .card { background: #1e293b; padding: 2.5rem 2rem; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); max-width: 420px; width: 90%; }
            h1 { color: #f59e0b; margin: 0 0 1rem 0; font-size: 1.6rem; }
            p { color: #94a3b8; margin: 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>⏳ Initializing...</h1>
            <p>Starting WhatsApp client. The QR code will appear here shortly.</p>
          </div>
        </body>
        </html>
      `);
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 HTTP health server listening on 0.0.0.0:${PORT}`);
  console.log(`👉 Open http://localhost:${PORT}/qr to view the QR code in browser`);
});

// ==========================================
// WHATSAPP CLIENT
// ==========================================

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "whatsapp-bot",
    dataPath: authDataPath,
  }),

  puppeteer: {
    headless: true,

    executablePath:
      process.env.CHROME_BIN ||
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      undefined,

    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
      "--single-process",
    ],
  },
});

// ==========================================
// QR CODE
// ==========================================

client.on("qr", async (qr) => {
  console.log("\n=================================");
  console.log("Scan this QR code with WhatsApp:");
  console.log("=================================\n");

  currentQr = qr;

  try {
    qrcode.generate(qr, {
      small: true,
    });
  } catch (qrErr) {
    console.error("❌ Failed to render QR in terminal:", qrErr.message);
  }

  try {
    const validEmailConfig =
      emailUser &&
      emailPass &&
      !emailUser.includes("your_email") &&
      !emailPass.includes("your_app_password");

    if (!validEmailConfig) {
      console.log(
        "ℹ️ Email credentials not configured; skipping QR email."
      );
      return;
    }

    const qrPngBuffer = qrImage.imageSync(qr, {
      type: "png",
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });

    await transporter.sendMail({
      from: `"${botName}" <${emailUser}>`,
      to: emailTo,
      subject: `${botName} - WhatsApp QR Code`,
      text:
        `Hello,\n\nHere is your new WhatsApp Bot login QR Code.\nPlease scan it from WhatsApp within 1 minute.\n\nSent by ${botName}`,

      attachments: [
        {
          filename: "qrcode.png",
          content: qrPngBuffer,
        },
      ],
    });

    console.log(
      `✅ QR Code sent to email (${emailTo}) successfully!`
    );
  } catch (error) {
    console.error(
      "❌ Failed to send QR Code email:",
      error.message
    );
  }
});

// ==========================================
// LOADING
// ==========================================

client.on("loading_screen", (percent, message) => {
  console.log(
    `Loading: ${percent}% - ${message}`
  );
});

// ==========================================
// AUTHENTICATED
// ==========================================

client.on("authenticated", () => {
  currentQr = null;

  console.log(
    "✅ WhatsApp authenticated successfully."
  );
});

// ==========================================
// AUTH FAILURE
// ==========================================

client.on("auth_failure", (message) => {
  console.error(
    "❌ Authentication failed:",
    message
  );
});

// ==========================================
// READY
// ==========================================

client.on("ready", () => {
  currentQr = null;

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

// ==========================================
// DISCONNECTED
// ==========================================

client.on("disconnected", (reason) => {
  console.log(
    "⚠️ WhatsApp disconnected:",
    reason
  );

  currentQr = null;
});

// ==========================================
// MESSAGE HANDLER
// ==========================================

client.on("message_create", async (msg) => {
  try {
    // Ignore empty messages
    if (!msg || !msg.body) {
      return;
    }

    const body = msg.body.trim();

    // Only commands beginning with "."
    if (!body.startsWith(".")) {
      return;
    }

    // Determine target chat ID (supports both groups and direct private messages)
    const chatId = msg.fromMe ? msg.to : msg.from;
    if (!chatId) {
      return;
    }

    const isGroup = chatId.endsWith("@g.us");

    const lowerBody = body.toLowerCase();

    // ==========================================
    // PING
    // ==========================================

    if (lowerBody === ".ping") {
      await msg.reply("🏓 pong");
      return;
    }

    // ==========================================
    // STATUS
    // ==========================================

    if (lowerBody === ".status") {
      const uptimeSec = Math.floor(
        (Date.now() - startTime) / 1000
      );

      const hours = Math.floor(
        uptimeSec / 3600
      );

      const minutes = Math.floor(
        (uptimeSec % 3600) / 60
      );

      const seconds = uptimeSec % 60;

      await msg.reply(
        `*${botName} Status*\n\n` +
        `🟢 Online\n` +
        `⏱️ Uptime: ${hours}h ${minutes}m ${seconds}s`
      );

      return;
    }

    // ==========================================
    // MENU
    // ==========================================

    if (
      lowerBody === ".menu" ||
      lowerBody === ".help"
    ) {
      const menuText =
        `*${botName}*\n\n` +
        `*Commands:*\n\n` +
        `🎵 *.play <song name>*\n` +
        `Search YouTube and send the song as MP3.\n\n` +
        `👥 *.tagall*\n` +
        `Mention everyone in the group.\n\n` +
        `🏓 *.ping*\n` +
        `Check bot availability.\n\n` +
        `📊 *.status*\n` +
        `Show bot uptime.\n\n` +
        `📖 *.menu* / *.help*\n` +
        `Show this menu.\n\n` +
        `_Download limit: ${MAX_DURATION_SECONDS / 60} minutes / ${MAX_FILE_SIZE_MB} MB_`;

      await msg.reply(menuText);
      return;
    }

    // ==========================================
    // TAG ALL (Group only)
    // ==========================================

    if (lowerBody === ".tagall") {
      if (!isGroup) {
        await msg.reply(
          "❌ This command only works in groups."
        );
        return;
      }

      try {
        const chat = await msg.getChat();

        if (!chat.isGroup) {
          await msg.reply(
            "❌ This command only works in groups."
          );
          return;
        }

        const participants = chat.participants || [];

        if (participants.length === 0) {
          await msg.reply(
            "❌ No group members found."
          );
          return;
        }

        const mentions = [];

        let text =
          `📢 *Attention Everyone!*\n\n`;

        for (const participant of participants) {
          const id =
            participant.id?._serialized;

          if (!id) {
            continue;
          }

          mentions.push(id);

          const username =
            participant.id?.user || "member";

          text += `@${username} `;
        }

        await chat.sendMessage(text, {
          mentions,
        });

        console.log(
          `✅ Tagged ${mentions.length} members.`
        );
      } catch (error) {
        console.error(
          "❌ Tagall error:",
          error
        );

        try {
          await msg.reply(
            "❌ Failed to tag all members."
          );
        } catch {}
      }

      return;
    }

    // ==========================================
    // PLAY
    // ==========================================

    if (
      lowerBody === ".play" ||
      lowerBody.startsWith(".play ")
    ) {
      const songName = body
        .slice(5)
        .trim();

      if (!songName) {
        await msg.reply(
          "❌ Usage: .play <song name>"
        );
        return;
      }

      let filePath = null;

      try {
        // --------------------------------------
        // SEARCH
        // --------------------------------------

        console.log(
          `🔍 Searching for: ${songName}`
        );

        await safeReact(msg, "🔍");

        const searchResults =
          await ytSearch(songName);

        if (
          !searchResults ||
          !searchResults.videos ||
          searchResults.videos.length === 0
        ) {
          await safeReact(msg, "❌");

          await msg.reply(
            "❌ Song not found."
          );

          return;
        }

        const song =
          searchResults.videos[0];

        console.log(
          `🎵 Found: ${song.title}`
        );

        console.log(
          `🔗 URL: ${song.url}`
        );

        // --------------------------------------
        // DURATION CHECK
        // --------------------------------------

        const duration =
          Number(song.duration?.seconds || 0);

        if (
          duration <= 0
        ) {
          await safeReact(msg, "❌");

          await msg.reply(
            "❌ Unable to determine song duration."
          );

          return;
        }

        if (
          duration > MAX_DURATION_SECONDS
        ) {
          await safeReact(msg, "❌");

          await msg.reply(
            `❌ Song is too long.\n\n` +
            `Duration: ${song.duration.timestamp}\n` +
            `Limit: ${MAX_DURATION_SECONDS / 60} minutes.`
          );

          return;
        }

        // --------------------------------------
        // DOWNLOAD
        // --------------------------------------

        await safeReact(msg, "⬇️");

        console.log(
          `⬇️ Downloading: ${song.title}`
        );

        filePath =
          await downloadMp3(song.url);

        if (!filePath) {
          throw new Error(
            "Downloader did not return a file path."
          );
        }

        // --------------------------------------
        // FILE EXISTS
        // --------------------------------------

        if (
          !fs.existsSync(filePath)
        ) {
          throw new Error(
            "Downloaded file does not exist."
          );
        }

        // --------------------------------------
        // FILE SIZE
        // --------------------------------------

        const stats =
          fs.statSync(filePath);

        const sizeMB =
          stats.size /
          (1024 * 1024);

        console.log(
          `📦 File size: ${sizeMB.toFixed(2)} MB`
        );

        if (
          stats.size >
          MAX_FILE_SIZE_BYTES
        ) {
          await safeReact(msg, "❌");

          await msg.reply(
            `❌ File is too large.\n\n` +
            `Size: ${sizeMB.toFixed(2)} MB\n` +
            `Limit: ${MAX_FILE_SIZE_MB} MB`
          );

          return;
        }

        // --------------------------------------
        // SEND
        // --------------------------------------

        await safeReact(msg, "✅");

        console.log(
          `📤 Sending: ${song.title}`
        );

        const media =
          MessageMedia.fromFilePath(
            filePath
          );

        try {
          await msg.reply(media, undefined, {
            sendAudioAsVoice: false,
          });
        } catch (replyError) {
          console.warn(
            "⚠️ msg.reply failed, trying client.sendMessage fallback:",
            replyError.message
          );

          await client.sendMessage(
            chatId,
            media,
            { sendAudioAsVoice: false }
          );
        }

        console.log(
          `✅ Sent: ${song.title}`
        );
      } catch (error) {
        console.error(
          "❌ Play command error:",
          error
        );

        await safeReact(msg, "❌");

        try {
          await msg.reply(
            "❌ Failed to download or send the song."
          );
        } catch {}
      } finally {
        // --------------------------------------
        // CLEANUP
        // --------------------------------------

        if (
          filePath &&
          fs.existsSync(filePath)
        ) {
          try {
            fs.unlinkSync(filePath);

            console.log(
              "🧹 Temporary MP3 deleted."
            );
          } catch (cleanupError) {
            console.error(
              "❌ Cleanup error:",
              cleanupError.message
            );
          }
        }
      }

      return;
    }

    // ==========================================
    // UNKNOWN COMMAND
    // ==========================================

    const command =
      body.split(/\s+/)[0];

    if (command.startsWith(".")) {
      await msg.reply(
        `❌ Unknown command: ${command}\n\n` +
        `Type *.menu* to see available commands.`
      );
    }
  } catch (error) {
    console.error(
      "❌ Error processing message:",
      error
    );
  }
});

// ==========================================
// INITIALIZE WITH AUTO RECOVERY
// ==========================================

console.log(
  `🚀 Starting ${botName}...`
);

client.initialize().catch(async (err) => {
  console.error("❌ Failed to initialize WhatsApp client:", err.message || err);

  const isCorruptedSession =
    err.message &&
    (err.message.includes("Socket") ||
      err.message.includes("Evaluation failed") ||
      err.message.includes("auth timeout") ||
      err.message.includes("Protocol error"));

  if (isCorruptedSession) {
    console.warn("⚠️ Corrupted or stale session detected in .wwebjs_auth. Cleaning up...");
    try {
      if (fs.existsSync(authDataPath)) {
        fs.rmSync(authDataPath, { recursive: true, force: true });
        console.log("🧹 .wwebjs_auth removed. Please restart the bot to scan a fresh QR code.");
      }
    } catch (cleanErr) {
      console.error("Failed to clean auth directory:", cleanErr.message);
    }
  }
});
