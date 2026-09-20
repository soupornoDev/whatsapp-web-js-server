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
const MAX_DURATION_SECONDS = 15 * 60; // 15 Minutes limit
const MAX_MP3_BYTES = 20 * 1024 * 1024; // 20 MB limit

const REACTION = Object.freeze({
    blocked: '🚫', menu: '📋', ping: '🏓',
    success: '✅', question: '❓', failure: '❌',
    waiting: '⏳', searching: '🔎', downloading: '⬇️',
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
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
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
    void handleMessage(message).catch(logHandlerError);
});

async function handleMessage(message) {
    if (message.fromMe || !message.body) return;

    const command = parseCommand(message.body);
    if (!command) return;

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
        const searchResults = await youtube.search(query, { type: 'video' });
        
        const videos = searchResults.videos || searchResults.results || [];
        const video = videos.find((item) => {
            const duration = item.duration?.seconds || item.duration;
            return duration && duration > 0 && duration <= MAX_DURATION_SECONDS;
        });

        if (!video) {
            await message.react(REACTION.failure);
            await replySafely(message, 'No playable result under 15 minutes was found. Try a more specific search.');
            return;
        }

        const videoId = video.id || video.video_id;
        const videoTitle = video.title?.text || video.title?.toString() || query;

        await message.react(REACTION.downloading);
        await replySafely(message, `Downloading: *${videoTitle}*`);

        mp3Path = path.join(os.tmpdir(), `play_${crypto.randomBytes(6).toString('hex')}.mp3`);
        await downloadMp3(videoId, mp3Path);

        const media = MessageMedia.fromFilePath(mp3Path);
        const chat = await message.getChat();

        // অডিও ক্র্যাশ এড়াতে ডকুমেন্ট আকারে পাঠানো হচ্ছে
        await withRetry(() => chat.sendMessage(media, {
            sendMediaAsDocument: true
        }));

        await replySafely(message, `🎵 *${videoTitle}*\n🔗 https://www.youtube.com/watch?v=${videoId}`);
        await message.react(REACTION.success);

    } catch (error) {
        console.error('.play failed:', error);
        await message.react(REACTION.failure).catch(() => {});
        await replySafely(message, 'Sorry, I could not download or send that song. Please try again.');
    } finally {
        activeChats.delete(chatId);
        if (mp3Path) {
            await fsp.unlink(mp3Path).catch(() => {});
        }
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
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    await youtubedl(videoUrl, {
        noPlaylist: true,
        format: 'bestaudio/best',
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: '128K',
        ffmpegLocation: ffmpegPath,
        output: outputPath,
        noProgress: true,
        noWarnings: true,
    });

    const { size } = await fsp.stat(outputPath);
    if (size === 0 || size > MAX_MP3_BYTES) {
        throw new Error('Downloaded file is empty or exceeds 20MB.');
    }
}

function buildMenu() {
    return [
        `*${BOT_NAME} - Command Menu*`, '',
        `${PREFIX}play <song name>  - Search, download and send an MP3`,
        `${PREFIX}menu               - Show this menu`,
        `${PREFIX}help               - Show this menu`,
        `${PREFIX}ping               - Check if the bot is online`,
        `${PREFIX}status             - Show bot uptime`, '',
        'Note: Works in WhatsApp groups only.',
    ].join('\n');
}

function formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

async function replySafely(message, text) {
    return withRetry(() => message.reply(text));
}

async function withRetry(operation, attempts = 3) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt < attempts - 1) await delay(1000 * (attempt + 1));
        }
    }
    throw lastError;
}

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function logHandlerError(error) {
    console.error('WhatsApp event handler error:', error);
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