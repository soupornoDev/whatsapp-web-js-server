<div align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" width="100" />
  <h1>🎵 WhatsApp Group Music Bot 🎵</h1>
  <p><i>A powerful, group-only WhatsApp bot that downloads YouTube music, tags everyone, and more!</i></p>
</div>

---

## ✨ Features

- 🎧 **YouTube to MP3**: Seamlessly search for any song and send it directly into the chat as an audio file.
- 📣 **Tag All**: Easily grab everyone's attention by tagging all participants in the group with a single command.
- ⚙️ **Smart Constraints**: Built-in limits (15 minutes maximum length, 20 MB maximum size) to keep the bot fast and avoid WhatsApp media limits.
- 🧹 **Auto-Cleanup**: Automatically cleans up downloaded files from the disk after sending them, ensuring your server storage stays empty.
- 🛡️ **Resilient**: Fully patched against recent `whatsapp-web.js` bugs (such as the notorious `r:r` / "Data passed to getter" crashes) caused by WhatsApp Web updates, making it highly stable.
- 📊 **Status & Uptime**: Check if the bot is alive and see how long it's been running.

---

## 🛠️ Commands

| Command | Description |
| :--- | :--- |
| `.menu` / `.help` | Displays the custom bot menu. |
| `.play <song name>` | Searches YouTube for the song, downloads it, and sends it as an MP3. |
| `.tagall` | Tags every single member in the group chat. |
| `.ping` | Responds with `pong` to check bot availability. |
| `.status` | Displays the bot's current uptime. |

> **Note:** The bot is designed to work **exclusively in groups**. It will ignore messages in direct chats to prevent spam.

---

## 🚀 How to Run

### Prerequisites
- **Node.js** (v18 or newer)
- A dedicated WhatsApp account (do not use your personal number to avoid bans).

### Installation & Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configuration (Optional)**
   You can change the name of the bot displayed in the `.menu` by setting the `BOT_NAME` environment variable before running.

3. **Start the Bot**
   ```bash
   npm start
   ```
   *(Or run `node index.js` directly)*

4. **Link Your Device**
   When you start the bot for the first time, it will generate a QR code in the terminal. Open WhatsApp on your phone, go to **Linked Devices**, and scan the QR code.

5. **Enjoy!**
   Add your bot's WhatsApp account to a group, type `.menu`, and you're good to go!

---

## 📂 Deployment Notes

- **Authentication persistence:** The login session is securely stored locally in the `.wwebjs_auth/` folder. This means you only need to scan the QR code once. **Keep this directory safe** when deploying.
- **Process Management:** When deploying to a server (like VPS), use a process manager like [PM2](https://pm2.keymetrics.io/) or Docker with a restart policy (`unless-stopped`) to keep the bot running 24/7.
- **Single Instance:** Do not run multiple instances of the bot using the same `.wwebjs_auth/` directory at the same time, as this will corrupt the session.

---
*Disclaimer: Only download and share media you have the right to use. This bot relies on unofficial WhatsApp Web libraries and may require maintenance if WhatsApp updates their web interface.*
