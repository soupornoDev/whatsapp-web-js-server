const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const ffmpegPath = require('ffmpeg-static');
const youtubedl = require('youtube-dl-exec');
const crypto = require('crypto');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const PREFIX = '.';
const BOT_NAME = process.env.BOT_NAME || 'Music Bot';
const MAX_QUERY_LENGTH = 150;
const MAX_DURATION_SECONDS = 15 * 60;
const MAX_MP3_BYTES = 20 * 1024 * 1024;
const REACTION = Object.freeze({
    blocked: '\u{1F6AB}', menu: '\u{1F4CB}', ping: '\u{1F3D3}',
    success: '\u{2705}', question: '\u{2753}', failure: '\u{274C}',
    waiting: '\u{23F3}', searching: '\u{1F50E}', downloading: '\u{2B07}\u{FE0F}',
});
const activeChats = new Set();
let youtubePromise;

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'music-group-bot',
        dataPath: path.join(__dirname, '.wwebjs_auth'),
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0,
});

client.on('qr', (qr) => {
    console.log('Scan this QR code with WhatsApp > Linked devices:');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => console.log('WhatsApp authentication successful.'));
client.on('auth_failure', (message) => console.error('Authentication failed:', message));
client.on('ready', () => console.log(`${BOT_NAME} is ready.`));
client.on('disconnected', (reason) => console.warn('WhatsApp disconnected:', reason));

client.on('group_join', (notification) => {
    void welcomeGroup(notification).catch(logHandlerError);
});

async function welcomeGroup(notification) {
    const groupName = notification.chat?.name || 'this group';
    console.log(`Joined group: ${groupName}`);
    await notification.reply(`Hello! I am ${BOT_NAME}. Send ${PREFIX}menu to see my commands.`);
}

client.on('message', (message) => {
    // EventEmitter does not await async listeners. Catching here prevents a
    // transient WhatsApp Web/Puppeteer error from terminating Node.js.
    void handleMessage(message).catch(logHandlerError);
});

async function handleMessage(message) {
    if (message.fromMe || !message.body) return;

    const command = parseCommand(message.body);
    if (!command) return;

    // Do not call message.getChat() here. whatsapp-web.js 1.34.7 can throw
    // `r: r` from getChatById after a recent WhatsApp Web update. The group
    // JID is already present in every inbound group message.
    const chatId = message.from;
    if (!chatId?.endsWith('@g.us')) {
        await message.react(REACTION.blocked).catch(() => {});
        await replySafely(message, 'This bot is available in WhatsApp groups only.');
        return;
    }

    if (command.name === 'menu' || command.name === 'help') {
        await message.react(REACTION.menu).catch(() => {});
        await replySafely(message, buildMenu());
        return;
    }
    if (command.name === 'ping') {
        await message.react(REACTION.ping).catch(() => {});
        await replySafely(message, 'Pong! Bot is online.');
        return;
    }
    if (command.name === 'status') {
        await message.react(REACTION.success).catch(() => {});
        await replySafely(message, `Online for ${formatUptime(process.uptime())}.`);
        return;
    }
    if (command.name !== 'play') return;

    if (!command.argument) {
        await message.react(REACTION.question).catch(() => {});
        await replySafely(message, `Usage: ${PREFIX}play <song name>`);
        return;
    }
    if (command.argument.length > MAX_QUERY_LENGTH) {
        await message.react(REACTION.failure).catch(() => {});
        await replySafely(message, `Song name must be ${MAX_QUERY_LENGTH} characters or fewer.`);
        return;
    }
    await handlePlay(message, chatId, command.argument);
}

function parseCommand(body) {
    const match = body.trim().match(/^\.([a-z]+)(?:\s+([\s\S]*))?$/i);
    if (!match) return null;
    return { name: match[1].toLowerCase(), argument: (match[2] || '').trim() };
}

async function handlePlay(message, chatId, query) {
    if (activeChats.has(chatId)) {
        await message.react(REACTION.waiting).catch(() => {});
        await replySafely(message, 'A song is already being prepared for this group. Please wait.');
        return;
    }

    activeChats.add(chatId);
    let mp3Path;
    try {
        await message.react(REACTION.searching);
        const youtube = await getYoutube();
        const results = await youtube.search(query);
        const video = results.videos.find((item) => item.duration.seconds > 0 && item.duration.seconds <= MAX_DURATION_SECONDS);
        if (!video) {
            await message.react(REACTION.failure);
            await replySafely(message, 'No playable result under 15 minutes was found. Try a more specific name.');
            return;
        }

        await message.react(REACTION.downloading);
        await replySafely(message, `Downloading: *${video.title.text}*`);
        mp3Path = path.join(os.tmpdir(), `whatsapp-play-${crypto.randomUUID()}.mp3`);
        await downloadMp3(video.video_id, mp3Path);

        const media = MessageMedia.fromFilePath(mp3Path);
        await withRetry(() => client.sendMessage(chatId, media, {
            sendAudioAsVoice: false,
            caption: `${video.title.text}\nhttps://www.youtube.com/watch?v=${video.video_id}`,
        }));
        await message.react(REACTION.success);
    } catch (error) {
        console.error('.play failed:', error);
        await message.react(REACTION.failure).catch(() => {});
        await replySafely(message, 'Sorry, I could not download that song. Please try another search.');
    } finally {
        activeChats.delete(chatId);
        if (mp3Path) await fsp.unlink(mp3Path).catch(() => {});
    }
}

async function getYoutube() {
    if (!youtubePromise) {
        youtubePromise = import('youtubei.js')
            .then(({ Innertube }) => Innertube.create({ lang: 'en', location: 'US' }))
            .catch((error) => {
                youtubePromise = undefined;
                throw error;
            });
    }
    return youtubePromise;
}

async function downloadMp3(videoId, outputPath) {
    const outputTemplate = outputPath.replace(/\.mp3$/i, '.%(ext)s');
    await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
        noPlaylist: true,
        format: 'bestaudio/best',
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: '128K',
        ffmpegLocation: path.dirname(ffmpegPath),
        maxFilesize: '24M',
        output: outputTemplate,
        noProgress: true,
        noWarnings: true,
    });

    const { size } = await fsp.stat(outputPath);
    if (size === 0 || size > MAX_MP3_BYTES) {
        throw new Error('MP3 file is outside the allowed size limit.');
    }
}

function buildMenu() {
    return [
        `*${BOT_NAME} - Command Menu*`, '',
        `${PREFIX}play <song name>  - Search, download and send an MP3`,
        `${PREFIX}menu              - Show this menu`,
        `${PREFIX}help              - Show this menu`,
        `${PREFIX}ping              - Check if the bot is online`,
        `${PREFIX}status            - Show bot uptime`, '',
        'The bot works in groups. Please use music you are permitted to download and share.',
    ].join('\n');
}

function formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

async function replySafely(message, text) {
    return withRetry(() => client.sendMessage(message.from, text, {
        quotedMessageId: message.id._serialized,
    }));
}

async function withRetry(operation, attempts = 3) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt < attempts - 1) await delay(700 * (attempt + 1));
        }
    }
    throw lastError;
}

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function logHandlerError(error) {
    // WhatsApp Web may briefly invalidate an execution context while syncing.
    // Log it instead of letting an async event handler become an unhandled rejection.
    console.error('WhatsApp event handler failed:', error);
}

async function shutdown(signal) {
    console.log(`Received ${signal}; closing WhatsApp client...`);
    await client.destroy().catch((error) => console.error('Shutdown error:', error));
    process.exit(0);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', logHandlerError);
client.initialize();
