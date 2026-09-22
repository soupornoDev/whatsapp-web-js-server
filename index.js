const fs = require("fs");
const path = require("path");
require("dotenv").config();
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

const botName = process.env.BOT_NAME || "WhatsApp Music Bot";

const emailUser =
  process.env.EMAIL_USER ||
  process.env.GMAIL_USER;

const emailPass =
  process.env.EMAIL_PASS ||
  process.env.GMAIL_APP_PASSWORD;

const emailTo =
  process.env.EMAIL_TO ||
  process.env.TO_EMAIL ||
  emailUser;

const MAX_DURATION_SECONDS = 15 * 60;
const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES =
  MAX_FILE_SIZE_MB * 1024 * 1024;

let currentQr = null;

const startTime = Date.now();

// ==========================================
// WHATSAPP CLIENT
// ==========================================

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "whatsapp-bot",
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

  qrcode.generate(qr, {
    small: true,
  });

  try {
    const qrPngBuffer = qrImage.imageSync(qr, {
      type: "png",
    });

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

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });

    await transporter.sendMail({
      from: emailUser,
      to: emailTo,
      subject: `${botName} - WhatsApp QR Code`,
      text:
        "Here is your new WhatsApp Bot login QR Code. " +
        "Please scan it within 1 minute.",

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

    // ------------------------------------------
    // GROUP ONLY
    // ------------------------------------------

    const isGroup =
      msg.from?.endsWith("@g.us") ||
      (
        msg.fromMe &&
        msg.to &&
        msg.to.endsWith("@g.us")
      );

    if (!isGroup) {
      return;
    }

    const chatId = msg.from?.endsWith("@g.us")
      ? msg.from
      : msg.to;

    if (!chatId) {
      return;
    }

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
    // TAG ALL
    // ==========================================

    if (lowerBody === ".tagall") {
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

        await msg.react("🔍");

        const searchResults =
          await ytSearch(songName);

        if (
          !searchResults ||
          !searchResults.videos ||
          searchResults.videos.length === 0
        ) {
          await msg.react("❌");

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
          await msg.react("❌");

          await msg.reply(
            "❌ Unable to determine song duration."
          );

          return;
        }

        if (
          duration > MAX_DURATION_SECONDS
        ) {
          await msg.react("❌");

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

        await msg.react("⬇️");

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
          await msg.react("❌");

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

        await msg.react("✅");

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
            "⚠️ msg.reply failed:",
            replyError.message
          );

          await client.sendMessage(
            chatId,
            media
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

        try {
          await msg.react("❌");
        } catch {}

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
// INITIALIZE
// ==========================================

console.log(
  `🚀 Starting ${botName}...`
);

client.initialize();