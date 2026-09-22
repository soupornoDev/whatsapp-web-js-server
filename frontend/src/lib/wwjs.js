"use server";

import qrImage from "qr-image";
import nodemailer from "nodemailer";
import qrcode from "qrcode-terminal";
import ytSearch from "yt-search";
import fs from "fs";
import path from "path";

// Adjust path based on your folder structure if needed
import downloadMp3 from "./bot-src/download-mp3.js";
import pkg from "whatsapp-web.js";

const { Client, LocalAuth, MessageMedia } = pkg;

// Cache the client instance globally to prevent multiple instances during hot-reloads
let globalClient = global.wwjsClient || null;
let isInitializing = global.wwjsInitializing || false;

export default async function wwjsBot() {
  return new Promise((resolve) => {
    try {
      const botName = process.env.BOT_NAME || "WhatsApp Music Bot";

      // Cleanup stale Windows lockfiles if no active client
      try {
        const sessionPath = path.join(process.cwd(), ".wwebjs_auth", "session-whatsapp-bot");
        const lockPath = path.join(sessionPath, "lockfile");
        if (!globalClient && fs.existsSync(lockPath)) {
          fs.unlinkSync(lockPath);
        }
      } catch (e) {
        // Ignored if file is locked or doesn't exist
      }

      if (!globalClient) {
        globalClient = new Client({
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
              "--disable-gpu",
            ],
          },
        });
        global.wwjsClient = globalClient;
      }

      const client = globalClient;

      let resolved = false;
      const doResolve = (data) => {
        if (!resolved) {
          resolved = true;
          resolve(data);
        }
      };

      // Safety timeout after 50 seconds so the server action returns cleanly
      const timeoutId = setTimeout(() => {
        doResolve({
          success: false,
          error: "QR generation timed out. Please click Get QR Code again."
        });
      }, 50000);

      if (client.info) {
        clearTimeout(timeoutId);
        return doResolve({ success: true, status: "ready" });
      }

      // One-time listener for the QR code
      client.once("qr", async (qr) => {
        clearTimeout(timeoutId);
        console.log("\n=================================");
        console.log("Scan this QR code with WhatsApp:");
        console.log("=================================\n");
        qrcode.generate(qr, { small: true });

        let qrDataUrl = null;
        try {
          const qrPngBuffer = qrImage.imageSync(qr, { type: "png" });
          qrDataUrl = `data:image/png;base64,${qrPngBuffer.toString('base64')}`;

          const emailUser = process.env.EMAIL_USER || process.env.GMAIL_USER;
          const emailPass = process.env.EMAIL_PASS || process.env.GMAIL_APP_PASSWORD;
          const emailTo = process.env.EMAIL_TO || process.env.TO_EMAIL || emailUser;

          if (emailUser && emailPass && !emailUser.includes("your_email") && !emailPass.includes("your_app_password")) {
            const transporter = nodemailer.createTransport({
              service: "gmail",
              auth: {
                user: emailUser,
                pass: emailPass,
              },
            });

            const mailOptions = {
              from: emailUser,
              to: emailTo,
              subject: "WhatsApp Bot QR Code",
              text: "Here is your new WhatsApp Bot login QR Code. Scan it within 1 minute.",
              attachments: [{ filename: "qrcode.png", content: qrPngBuffer }],
            };

            await transporter.sendMail(mailOptions);
            console.log(`✅ QR Code sent to email (${emailTo}) successfully!`);
          } else {
            console.log("ℹ️ Email credentials not configured; skipping email.");
          }
        } catch (error) {
          console.error("❌ Failed to send QR Code email:", error.message);
        }

        doResolve({ success: true, qrUrl: qrDataUrl });
      });

      // One-time listener for ready state
      client.once("ready", () => {
        clearTimeout(timeoutId);
        console.log("\n=================================");
        console.log(`       ${botName} Ready`);
        console.log("=================================");
        doResolve({ success: true, status: "ready" });
      });

      // Initialize client only once
      if (!isInitializing) {
        isInitializing = true;
        global.wwjsInitializing = true;

        client.on("loading_screen", (percent, message) => {
          console.log(`Loading: ${percent}% - ${message}`);
        });

        client.on("authenticated", () => {
          console.log("✅ WhatsApp authenticated successfully.");
        });

        client.on("auth_failure", (message) => {
          console.error("❌ Authentication failed:", message);
          isInitializing = false;
          global.wwjsInitializing = false;
        });

        client.on("disconnected", (reason) => {
          console.log("⚠️ WhatsApp disconnected:", reason);
          globalClient = null;
          global.wwjsClient = null;
          isInitializing = false;
          global.wwjsInitializing = false;
        });

        const startTime = Date.now();

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

        client.initialize().catch(err => {
          console.error("Initialize error:", err);
          isInitializing = false;
          global.wwjsInitializing = false;
          doResolve({ success: false, error: err.message || "Failed to initialize WhatsApp Web" });
        });
      }
    } catch (err) {
      console.error("Bot catch error:", err);
      doResolve({ success: false, error: err.message || "Unexpected error occurred" });
    }
  });
}