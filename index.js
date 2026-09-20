const {
  Client,
  LocalAuth,
  MessageMedia,
} = require("whatsapp-web.js");

const qrcode = require("qrcode-terminal");
const ytSearch = require("yt-search");
const downloadMp3 = require("./src/download-mp3");

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
  console.log("Scan this QR code with WhatsApp:");
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
  console.log("WhatsApp authenticated successfully.");
});

// ========================================
// Auth Failure
// ========================================

client.on("auth_failure", (message) => {
  console.error("Authentication failed:", message);
});

// ========================================
// Ready
// ========================================

client.on("ready", () => {
  console.log("=================================");
  console.log(" WhatsApp Bot is ready!");
  console.log(" Type .play <song name>");
  console.log("=================================");
});

// ========================================
// Disconnected
// ========================================

client.on("disconnected", (reason) => {
  console.log("WhatsApp disconnected:", reason);
});

// ========================================
// Message Handler
// ========================================

client.on("message", async (msg) => {
  try {
    const body = msg.body.trim();

    // Ignore other messages
    if (!body.toLowerCase().startsWith(".play")) {
      return;
    }

    // Get song name
    const songName = body.slice(5).trim();

    // Check song name
    if (!songName) {
      await msg.reply("❌ Usage: .play <song name>");
      return;
    }

    console.log(`Searching for: ${songName}`);

    // ========================================
    // Search YouTube
    // ========================================

    const searchResults = await ytSearch(songName);

    if (
      !searchResults ||
      !searchResults.videos ||
      searchResults.videos.length === 0
    ) {
      await msg.reply("❌ Song not found.");
      return;
    }

    // IMPORTANT:
    // Get first video from search results
    const song = searchResults.videos[0];

    console.log(`Found: ${song.title}`);
    console.log(`URL: ${song.url}`);

    // ========================================
    // Download Message
    // ========================================

    await msg.reply(
      `🎵 *Found:* ${song.title}\n\n` +
      `⏳ Downloading MP3...\n` +
      `Please wait...`
    );

    // ========================================
    // Download MP3
    // ========================================

    const filePath = await downloadMp3(song.url);

    const media = MessageMedia.fromFilePath(filePath);
    await msg.reply(media,msg.from);
  } catch (error) {
    console.error("Error processing message:", error);
    await msg.reply("❌ Failed to download the song. Please try again later.");
  }
});

// ========================================
// Initialize
// ========================================

client.initialize();
