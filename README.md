# WhatsApp Group Music Bot

## Run

1. Install Node.js 18 or newer.
2. Run `npm.cmd install`.
3. Optionally set `BOT_NAME` to change the bot name shown in the menu.
4. Run `npm.cmd start` and scan the QR code from WhatsApp's **Linked devices** screen.
5. Add that WhatsApp account to a group and send `.menu`.

The login session is stored locally in `.wwebjs_auth/`, so the QR scan normally only happens once. Keep this directory private and persistent when deploying the bot.

## Commands

| Command | Description |
| --- | --- |
| `.menu` or `.help` | Display the custom menu |
| `.play <song name>` | Search YouTube and send the selected result as an MP3 |
| `.ping` | Check bot availability |
| `.status` | Show uptime |

The bot works in groups only. A command's reaction changes to show its state: search, download, success, or failure. Downloads are limited to 15 minutes and 20 MB. Only download and share media you are allowed to use.

## Deployment notes

Run one bot process per WhatsApp account and persist `.wwebjs_auth/` between restarts. For a process manager, use a restart policy such as PM2 or Docker's `unless-stopped`; do not run multiple instances against the same session directory.
