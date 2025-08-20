const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs-extra');
const path = require('path');
const qrcode = require('qrcode-terminal');
const chalk = require('chalk');
const moment = require('moment');
require('dotenv').config();

// Memory optimization for VPS
process.env.NODE_OPTIONS = '--max-old-space-size=512 --optimize-for-size';

// Garbage collection optimization
if (global.gc) {
    setInterval(() => {
        global.gc();
    }, 30000); // Run GC every 30 seconds
}

// Import modules
const { loadDatabase, saveDatabase } = require('./utils/database');
const { isAdmin, formatCurrency, formatDate, normalizeSenderToPhone } = require('./utils/helpers');
const errorLogger = require('./utils/errorLogger');
const { handleAICommand } = require('./commands/ai');
const { handleUtilsCommand } = require('./commands/utils');
const { handleScheduleCommand } = require('./commands/schedule');
const { handleMediaCommand } = require('./commands/media');
const { handleFinanceCommand } = require('./commands/finance');
const { handleFileCommand } = require('./commands/files');
const { handleGroupCommand } = require('./commands/group');
const { handleAPIKeyCommand } = require('./commands/apikey');
const { handleUserAPIKeyCommand } = require('./commands/userApiKey');
const DriveCommand = require('./commands/drive');
// Tambah: sambutan command
const { handleSambutanCommand } = require('./commands/sambutan');
const GroupManager = require('./utils/groupManager');
const GroupAdminCommands = require('./commands/groupAdmin');
const GroupModerationCommands = require('./commands/groupModeration');
const GroupUtilitiesCommands = require('./commands/groupUtilities');
const GroupEntertainmentCommands = require('./commands/groupEntertainment');
const GroupAnalyticsCommands = require('./commands/groupAnalytics');

// Global variables
let sock;
let qr;
let isConnected = false;
let reconnectCount = 0;
const maxReconnectAttempts = 5;
const prefix = process.env.BOT_PREFIX || '.';
const { getAdminNumbers } = require('./utils/helpers');
let adminNumbers = getAdminNumbers();

// Helper function to get disconnect reason description (versi asik & humoris)
function getDisconnectReason(statusCode) {
    const reasons = {
        [DisconnectReason.badSession]: '🤪 Sesi lagi bad mood nih, kayak mantan!',
        [DisconnectReason.connectionClosed]: '🚪 Koneksi tutup pintu, ga mau ngobrol lagi',
        [DisconnectReason.connectionLost]: '🔍 Koneksi main petak umpet, hilang entah kemana',
        [DisconnectReason.connectionReplaced]: '💔 Digantiin sama yang lain, sakit hati banget!',
        [DisconnectReason.loggedOut]: '👋 Logout dulu ya, mau istirahat sebentar',
        [DisconnectReason.multideviceMismatch]: '📱 Device-nya pada berantem, ga mau akur',
        [DisconnectReason.forbidden]: '🚫 Dilarang masuk! Kayak masuk warnet tanpa bayar',
        [DisconnectReason.restartRequired]: '🔄 Butuh restart nih, kayak hidup yang perlu refresh',
        [DisconnectReason.timedOut]: '⏰ Kelamaan nunggu, udah timeout kayak nunggu gebetan bales chat',
        [DisconnectReason.unavailableService]: '🛠️ Lagi maintenance, sabar ya bestie!'
    };
    return reasons[statusCode] || `🤷‍♂️ Entahlah, error aneh bin ajaib (${statusCode})`;
}

// Initialize Drive Command
const driveCommand = new DriveCommand();

// Initialize Group Features
const groupManager = new GroupManager();
const groupAdminCommands = new GroupAdminCommands();
const groupModerationCommands = new GroupModerationCommands();
const groupUtilitiesCommands = new GroupUtilitiesCommands();
const groupEntertainmentCommands = new GroupEntertainmentCommands();
const groupAnalyticsCommands = new GroupAnalyticsCommands();

// Database
let financeDB = {};
let usersDB = {};
let groupsDB = {};
let filesDB = {};

// Mobile responsive menu function
async function sendMobileMenu(sock, from) {
    const menuText = `
╭─────────────────────────╮
│    🤖 *BOT KKN MENU*    │
╰─────────────────────────╯

💰 *KEUANGAN*
├ .masuk
├ .keluar
├ .saldo
├ .laporan
├ .kategori
├ .backup
└ .restore

👥 *GRUP ADMIN*
├ .ban - Ban member dari grup
├ .unban - Unban member
├ .mute - Mute member
├ .unmute - Unmute member
├ .warn - Beri peringatan
├ .addmod - Tambah moderator
├ .removemod - Hapus moderator
├ .logs - Lihat log grup
└ .groupinfo - Info grup

🛡️ *GRUP MODERASI*
├ .antispam - Atur anti-spam
├ .wordfilter - Filter kata
├ .linkcontrol - Kontrol link
└ .autodelete - Auto hapus pesan

🔧 *GRUP UTILITAS*
├ .welcome - Atur pesan selamat datang
├ .goodbye - Atur pesan perpisahan
├ .rules - Atur aturan grup
├ .poll - Buat polling
├ .reminder - Buat pengingat
└ .sambutan - Sambut & kenalkan bot (mention semua)

🎮 *GRUP HIBURAN*
├ .trivia - Kuis trivia
├ .wordguess - Tebak kata
├ .joke - Lelucon random
├ .quote - Quote inspiratif
├ .addjoke - Tambah lelucon
├ .addquote - Tambah quote
├ .games - Mulai permainan
├ .stopgame - Hentikan permainan
└ .leaderboard - Papan skor

📊 *GRUP ANALITIK*
├ .stats - Statistik grup
├ .userstats - Statistik user
├ .exportstats - Export statistik
└ .resetstats - Reset statistik

👥 *GRUP LAMA*
├ .tagall
├ .hidetag
├ .add
├ .kick
├ .promote
├ .demote
└ .group

🤖 *AI CHATBOT*
├ .ai
├ .chat
├ .ask
├ .generate
├ .create
├ .analyze
├ .analisis
├ .translate
├ .terjemah
├ .summarize
├ .ringkas
├ .explain
└ .jelaskan

🔑 *API MANAGEMENT*
├ .apikey
├ .setapikey
├ .listapikey
├ .rotateapi
└ .apistats

👤 *USER API*
├ .pilihapi
├ .infoapi
├ .availableapi
└ .resetapi

🌤️ *CUACA*
├ .cuaca
└ .weather

📁 *DRIVE KKN*
├ .drive
├ .upload
├ .download
├ .kknfiles
├ .drivelist
├ .drivesearch
├ .driveinfo
├ .driverename
├ .drivedelete
├ .drivestorage
└ .files

🎨 *MEDIA*
├ .sticker
├ .toimg
├ .removebg
├ .ocr
├ .qr
├ .readqr
├ .ytdl
├ .tiktok
└ .igdl

🔧 *UTILITIES*
├ .ping
├ .uptime
├ .info
├ .stats
├ .news
├ .currency
├ .calculator
├ .password
├ .timezone
├ .shorturl
├ .whois
├ .base64
├ .hash
├ .color
└ .ip

📅 *JADWAL*
├ .schedule
├ .reminder
├ .listschedule
├ .deleteschedule
├ .agenda
├ .meeting
├ .deadline
└ .event

╭─────────────────────────╮
│   ⚡ *BOT KKN v1.0*     │
│   📱 Ketik .menu        │
╰─────────────────────────╯
`;

    try {
        // Try to send with local image first
        const imagePath = path.join(__dirname, 'uploads', 'kkn', 'images', 'd83d7ded1654d103d02618277ffdcf41.jpg');
        
        if (fs.existsSync(imagePath)) {
            // Read and compress image for faster loading
            const imageBuffer = await fs.readFile(imagePath);
            await sock.sendMessage(from, {
                image: imageBuffer,
                caption: menuText,
                jpegQuality: 60, // Compress image for faster loading
                contextInfo: {
                    externalAdReply: {
                        title: '🤖 BOT_KKNPULO_SAROK2025',
                        body: 'Menu Lengkap Bot KKN Pulo Sarok 2025',
                        mediaType: 1,
                        renderLargerThumbnail: false
                    }
                }
            });
        } else {
            // Fallback to simple text only
            await sock.sendMessage(from, {
                text: menuText,
                contextInfo: {
                    externalAdReply: {
                        title: '🤖 BOT_KKNPULO_SAROK2025',
                        body: 'Menu Lengkap Bot KKN Pulo Sarok 2025',
                        mediaType: 1,
                        renderLargerThumbnail: false
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error sending menu:', error);
        // Final fallback to simple text
        await sock.sendMessage(from, { text: menuText });
    }
}

// Initialize bot
async function startBot() {
    console.log(chalk.blue('\n=== BOT KKN ==='));
    console.log(chalk.green('🚀 Starting WhatsApp Bot KKN...'));
    
    try {
        // Load databases
        financeDB = await loadDatabase('finance.json');
        usersDB = await loadDatabase('users.json');
        groupsDB = await loadDatabase('groups.json');
        filesDB = await loadDatabase('files.json');
        
        console.log(chalk.green('✅ Databases loaded successfully'));
        
        // Initialize WhatsApp connection
        await connectToWhatsApp();
        
    } catch (error) {
        console.error(chalk.red('❌ Error starting bot:'), error);
        process.exit(1);
    }
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    console.log(chalk.yellow(`Using WA v${version.join('.')}, isLatest: ${isLatest}`));
    
    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: {
            level: 'silent',
            child: () => ({
                level: 'silent',
                trace: () => {},
                debug: () => {},
                info: () => {},
                warn: () => {},
                error: () => {},
                fatal: () => {}
            }),
            trace: () => {},
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
            fatal: () => {}
        }, // Complete logger replacement
        browser: ['Bot KKN', 'Chrome', '1.0.0'],
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        defaultQueryTimeoutMs: 60000, // Increased from 30s to 60s
        keepAliveIntervalMs: 30000, // Increased from 10s to 30s for stability
        emitOwnEvents: false,
        fireInitQueries: false,
        shouldSyncHistoryMessage: false,
        connectTimeoutMs: 120000, // Increased from 60s to 120s
        qrTimeout: 60000, // Increased from 40s to 60s
        retryRequestDelayMs: 1000, // Increased from 250ms to 1s
        maxMsgRetryCount: 3, // Limit retry attempts
        shouldIgnoreJid: jid => jid.includes('broadcast'), // Ignore broadcast messages
        getMessage: async (key) => {
            return { conversation: '' }; // Return empty to reduce logs
        },
        // Suppress session and prekey logs
        options: {
            logger: {
                level: 'silent',
                child: () => ({
                    level: 'silent',
                    trace: () => {},
                    debug: () => {},
                    info: () => {},
                    warn: () => {},
                    error: () => {},
                    fatal: () => {}
                }),
                trace: () => {},
                debug: () => {},
                info: () => {},
                warn: () => {},
                error: () => {},
                fatal: () => {}
            }
        }
    });
    
    // Disable verbose logging and session outputs
    sock.ws.on('CB:call', () => {}); // Ignore call events
    sock.ws.on('CB:chatstate', () => {}); // Ignore chat state events
    
    // Suppress all session-related logs
    const originalConsoleLog = console.log;
    console.log = (...args) => {
        const message = args.join(' ');
        // Filter out session, prekey, and buffer logs
        if (message.includes('Closing stale open session') ||
            message.includes('Closing session:') ||
            message.includes('SessionEntry') ||
            message.includes('pendingPreKey') ||
            message.includes('Buffer') ||
            message.includes('chainKey') ||
            message.includes('ephemeralKeyPair') ||
            message.includes('baseKey')) {
            // Log to file instead of console
            errorLogger.logSession(message, 'session');
            return;
        }
        // Allow other logs
        originalConsoleLog.apply(console, args);
    };
    
    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr: newQr } = update;
        
        if (newQr) {
            qr = newQr;
            console.log(chalk.yellow('📱 Scan QR Code below:'));
            qrcode.generate(newQr, { small: true });
        }
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            // Enhanced logging for disconnect reasons
            console.log(chalk.red(`🔌 Connection closed. Status code: ${statusCode}`));
            console.log(chalk.red(`🔍 Disconnect reason: ${getDisconnectReason(statusCode)}`));
            
            // Log error to file instead of console spam
            if (lastDisconnect?.error) {
                errorLogger.logError(lastDisconnect.error, 'WhatsApp Connection');
                console.log(chalk.red(`❌ Error details: ${lastDisconnect.error.message || 'Unknown error'}`));
            }
            
            if (shouldReconnect) {
                // Check reconnect attempts limit
                if (reconnectCount >= maxReconnectAttempts) {
                    console.log(chalk.red(`❌ Maximum reconnect attempts (${maxReconnectAttempts}) reached. Stopping reconnection.`));
                    console.log(chalk.red('🔧 Please check your internet connection and restart the bot manually.'));
                    return;
                }
                
                // Add more specific conditions to prevent unnecessary reconnects
                if (statusCode === DisconnectReason.connectionClosed ||
                    statusCode === DisconnectReason.connectionLost ||
                    statusCode === DisconnectReason.restartRequired ||
                    statusCode === DisconnectReason.timedOut) {
                    
                    reconnectCount++;
                    console.log(chalk.yellow(`🔄 Reconnecting to WhatsApp... (Attempt ${reconnectCount}/${maxReconnectAttempts})`));
                    
                    // Progressive delay: longer delay for more attempts
                    const delay = Math.min(15000 + (reconnectCount * 5000), 60000); // Max 60 seconds
                    
                    setTimeout(() => {
                        console.log(chalk.yellow(`🔄 Attempting to reconnect... (${reconnectCount}/${maxReconnectAttempts})`));
                        connectToWhatsApp();
                    }, delay);
                } else {
                    console.log(chalk.red(`❌ Not reconnecting due to status code: ${statusCode}`));
                }
            } else {
                console.log(chalk.red('❌ Bot logged out. Manual restart required.'));
            }
            isConnected = false;
        } else if (connection === 'connecting') {
            console.log(chalk.yellow('🔄 Connecting to WhatsApp...'));
        } else if (connection === 'open') {
            console.log(chalk.green('✅ Connected to WhatsApp successfully!'));
            isConnected = true;
            
            // Reset reconnect counter on successful connection
            if (reconnectCount > 0) {
                console.log(chalk.green(`🔄 Connection restored after ${reconnectCount} attempts`));
                reconnectCount = 0;
            }
            
            // Send startup message to admins
            for (const admin of adminNumbers) {
                try {
                    await sock.sendMessage(admin + '@s.whatsapp.net', {
                        text: `🤖 *Bot KKN Online!*\n\n⏰ ${moment().format('DD/MM/YYYY HH:mm:ss')}\n🔋 Status: Ready\n📊 Database: Loaded\n\n_Bot siap digunakan!_`
                    });
                } catch (error) {
                    console.log(chalk.yellow(`⚠️ Could not send startup message to ${admin}`));
                }
            }
        }
    });
    
    // Save credentials
    sock.ev.on('creds.update', saveCreds);
    
    // Handle incoming messages
    const processedMessages = new Set();
    
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;
            
            // Create unique message ID to prevent duplicate processing
            const messageId = `${msg.key.remoteJid}-${msg.key.id}-${msg.key.participant || msg.key.remoteJid}`;
            
            if (processedMessages.has(messageId)) {
                console.log(`⚠️ Duplicate message detected, skipping: ${messageId}`);
                return;
            }
            
            processedMessages.add(messageId);
            
            // Clean up old message IDs (keep only last 100)
            if (processedMessages.size > 100) {
                const oldIds = Array.from(processedMessages).slice(0, 50);
                oldIds.forEach(id => processedMessages.delete(id));
            }
            
            // Minimal logging for message processing
            // console.log(`🔍 Message: ${messageId}`);
            
            await handleMessage(msg);
        } catch (error) {
            console.error(chalk.red('Error handling message:'), error);
        }
    });
    
    // Handle group updates
    sock.ev.on('groups.update', async (updates) => {
        for (const update of updates) {
            try {
                if (update.id && !groupsDB.groups[update.id]) {
                    groupsDB.groups[update.id] = {
                        id: update.id,
                        name: update.subject || 'Unknown',
                        joinedAt: new Date().toISOString(),
                        settings: {
                            financeEnabled: true,
                            aiEnabled: true,
                            welcomeMessage: true
                        },
                        stats: {
                            messageCount: 0,
                            commandCount: 0
                        }
                    };
                    await saveDatabase('groups.json', groupsDB);
                }
                
                // Initialize group in advanced database
                groupManager.initializeGroup(update.id, update.subject || 'Unknown');
            } catch (error) {
                console.error('Error handling group update:', error);
            }
        }
    });
    
    // Handle group participants update (join/leave)
    sock.ev.on('group-participants.update', async (update) => {
        try {
            const { id: groupId, participants, action } = update;
            
            for (const participant of participants) {
                if (action === 'add') {
                    // Handle welcome message
                    await groupUtilitiesCommands.handleWelcomeMessage(sock, groupId, participant);
                } else if (action === 'remove') {
                    // Handle goodbye message
                    await groupUtilitiesCommands.handleGoodbyeMessage(sock, groupId, participant);
                }
            }
        } catch (error) {
            console.error('Error handling group participants update:', error);
        }
    });
}

// Handle incoming messages
async function handleMessage(msg) {
    const messageType = Object.keys(msg.message)[0];
    const messageContent = msg.message[messageType];
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;
    const isGroup = from.endsWith('@g.us');
    const senderNumber = normalizeSenderToPhone(sender);
    const senderIsAdmin = isAdmin(senderNumber, adminNumbers);
    console.log(`🔍 DEBUG Sender Info:`);
    console.log(`  - Raw sender: ${sender}`);
    console.log(`  - Cleaned senderNumber: ${senderNumber}`);
    console.log(`  - Is admin check: ${adminNumbers.includes(senderNumber)}`);
    console.log(`  - Admin numbers loaded: ${JSON.stringify(adminNumbers)}`);
    
    // Optional debug: uncomment if needed
  // console.log(`🔍 DEBUG Sender Info:`);
  // console.log(`  - Raw sender: ${sender}`);
  // console.log(`  - Cleaned senderNumber: ${senderNumber}`);
  // console.log(`  - Admin numbers from settings: ${JSON.stringify(adminNumbers)}`);
  // console.log(`  - Is admin check: ${adminNumbers.includes(senderNumber)}`);

  // Reload admin settings periodically in case JSON changes
  if (Math.random() < 0.01) { // ~1% messages refresh
    try { adminNumbers = getAdminNumbers(); } catch {}
  }
    
    // Minimal message details logging
    // console.log(`🔍 Message from: ${senderNumber} | Type: ${messageType}`);
    
    let body = '';
    
    // Track message analytics for groups
    if (isGroup) {
        groupAnalyticsCommands.trackMessage(from, senderNumber);
    }
    
    // Extract message text
    if (messageType === 'conversation') {
        body = messageContent;
    } else if (messageType === 'extendedTextMessage') {
        body = messageContent.text;
    } else if (messageType === 'imageMessage' && messageContent.caption) {
        body = messageContent.caption;
    } else if (messageType === 'videoMessage' && messageContent.caption) {
        body = messageContent.caption;
    }
    
    // Apply automatic moderation for groups
    if (isGroup && body) {
        const moderationResult = await groupModerationCommands.checkMessage(from, senderNumber, body, sock);
        if (moderationResult.shouldDelete) {
            // Delete the message if moderation rules are violated
            try {
                await sock.sendMessage(from, { delete: msg.key });
            } catch (error) {
                console.log('Failed to delete message:', error.message);
            }
            return;
        }
    }
    
    if (!body || !body.startsWith(prefix)) {
        console.log(`❌ Message doesn't start with prefix '${prefix}' or is empty. Body: '${body}'`);
        return;
    }
    
    const args = body.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // Log command usage
    console.log(chalk.cyan(`📝 Command: ${command} | From: ${senderNumber} | Group: ${isGroup ? 'Yes' : 'No'}`));
    // console.log(`🔍 Command details: ${command} with args: ${JSON.stringify(args)}`);
    
    // Update user database
    if (!usersDB.users[senderNumber]) {
        usersDB.users[senderNumber] = {
            id: senderNumber,
            name: msg.pushName || 'Unknown',
            joinedAt: new Date().toISOString(),
            commandCount: 0,
            lastSeen: new Date().toISOString(),
            isAdmin: senderIsAdmin
        };
    }
    
    usersDB.users[senderNumber].commandCount++;
    usersDB.users[senderNumber].lastSeen = new Date().toISOString();
    await saveDatabase('users.json', usersDB);
    
    // Track command analytics for groups
    if (isGroup) {
        groupAnalyticsCommands.trackCommand(from, senderNumber, command);
    }
    
    // Command routing
    console.log(`🔍 Processing command: ${command}`);
    try {
        switch (command) {
            // Finance commands (Admin only)
            case 'masuk':
            case 'keluar':
            case 'saldo':
            case 'laporan':
            case 'kategori':
            case 'backup':
            case 'restore':
                console.log(`🔍 DEBUG Finance Command:`);
                console.log(`  - Command: ${command}`);
                console.log(`  - Sender Number: ${senderNumber}`);
                console.log(`  - Admin Numbers: ${JSON.stringify(adminNumbers)}`);
                console.log(`  - Is Admin: ${isAdmin(senderNumber, adminNumbers)}`);
                
                if (!isAdmin(senderNumber, adminNumbers)) {
                    console.log(`❌ Access denied for finance command: ${command}`);
                    await sock.sendMessage(from, {
                        text: '❌ *Akses Ditolak*\n\nHanya admin yang dapat menggunakan fitur keuangan.'
                    });
                    return;
                }
                
                console.log(`✅ Admin access granted for finance command: ${command}`);
                await handleFinanceCommand(sock, msg, command, args, financeDB);
                break;
                
            // Group commands (legacy)
            case 'tagall':
            case 'hidetag':
            case 'add':
            case 'kick':
            case 'promote':
            case 'demote':
            case 'group':
                await handleGroupCommand(sock, msg, command, args, groupsDB);
                break;
                
            // Sambutan command (Admin only, group only)
            case 'sambutan':
                if (!isGroup) {
                    await sock.sendMessage(from, { text: '❌ Perintah ini hanya dapat digunakan di grup.' });
                    break;
                }
                await handleSambutanCommand(sock, msg, 'sambutan', args, groupsDB);
                break;
            
            // Group Admin commands
            case 'ban':
            case 'unban':
            case 'mute':
            case 'unmute':
            case 'warn':
            case 'addmod':
            case 'removemod':
            case 'logs':
            case 'groupinfo':
                if (!isGroup) {
                    await sock.sendMessage(from, { text: '❌ Perintah ini hanya dapat digunakan di grup.' });
                    return;
                }
                switch (command) {
                    case 'ban':
                        await groupAdminCommands.handleBan(sock, msg, args);
                        break;
                    case 'unban':
                        await groupAdminCommands.handleUnban(sock, msg, args);
                        break;
                    case 'mute':
                        await groupAdminCommands.handleMute(sock, msg, args);
                        break;
                    case 'unmute':
                        await groupAdminCommands.handleUnmute(sock, msg, args);
                        break;
                    case 'warn':
                        await groupAdminCommands.handleWarn(sock, msg, args);
                        break;
                    case 'addmod':
                        await groupAdminCommands.handleAddModerator(sock, msg, args);
                        break;
                    case 'removemod':
                        await groupAdminCommands.handleRemoveModerator(sock, msg, args);
                        break;
                    case 'logs':
                        await groupAdminCommands.handleLogs(sock, msg, args);
                        break;
                    case 'groupinfo':
                        await groupAdminCommands.handleGroupInfo(sock, msg);
                        break;
                }
                break;
                
            // Group Moderation commands
            case 'antispam':
            case 'wordfilter':
            case 'linkcontrol':
            case 'autodelete':
                if (!isGroup) {
                    await sock.sendMessage(from, { text: '❌ Perintah ini hanya dapat digunakan di grup.' });
                    return;
                }
                switch (command) {
                    case 'antispam':
                        await groupModerationCommands.handleAntiSpam(sock, msg, args);
                        break;
                    case 'wordfilter':
                        await groupModerationCommands.handleWordFilter(sock, msg, args);
                        break;
                    case 'linkcontrol':
                        await groupModerationCommands.handleLinkControl(sock, msg, args);
                        break;
                    case 'autodelete':
                        await groupModerationCommands.handleAutoDelete(sock, msg, args);
                        break;
                }
                break;
                
            // Group Utilities commands
            case 'welcome':
            case 'goodbye':
            case 'rules':
            case 'poll':
            case 'reminder':
                if (!isGroup) {
                    await sock.sendMessage(from, { text: '❌ Perintah ini hanya dapat digunakan di grup.' });
                    return;
                }
                switch (command) {
                    case 'welcome':
                        try { console.log('[DEBUG] Routing welcome command', { from, isGroup, args }); } catch {}
                        await groupUtilitiesCommands.handleWelcome(sock, msg, args);
                        break;
                    case 'goodbye':
                        await groupUtilitiesCommands.handleGoodbye(sock, msg, args);
                        break;
                    case 'rules':
                        await groupUtilitiesCommands.handleRules(sock, msg, args);
                        break;
                    case 'poll':
                        await groupUtilitiesCommands.handlePoll(sock, msg, args);
                        break;
                    case 'reminder':
                        await groupUtilitiesCommands.handleReminder(sock, msg, args);
                        break;
                }
                break;
                
            // Group Entertainment commands
            case 'trivia':
            case 'wordguess':
            case 'joke':
            case 'quote':
            case 'addjoke':
            case 'addquote':
            case 'games':
            case 'stopgame':
            case 'leaderboard':
                if (!isGroup) {
                    await sock.sendMessage(from, { text: '❌ Perintah ini hanya dapat digunakan di grup.' });
                    return;
                }
                switch (command) {
                    case 'trivia':
                        await groupEntertainmentCommands.handleTrivia(sock, msg, args);
                        break;
                    case 'wordguess':
                        await groupEntertainmentCommands.handleWordGuess(sock, msg, args);
                        break;
                    case 'joke':
                        await groupEntertainmentCommands.handleJoke(sock, msg);
                        break;
                    case 'quote':
                        await groupEntertainmentCommands.handleQuote(sock, msg);
                        break;
                    case 'addjoke':
                        await groupEntertainmentCommands.handleAddJoke(sock, msg, args);
                        break;
                    case 'addquote':
                        await groupEntertainmentCommands.handleAddQuote(sock, msg, args);
                        break;
                    case 'games':
                        await groupEntertainmentCommands.handleConfigGames(sock, msg, args);
                        break;
                    case 'stopgame':
                        await groupEntertainmentCommands.handleStopGame(sock, msg);
                        break;
                    case 'leaderboard':
                        await groupEntertainmentCommands.handleLeaderboard(sock, msg, args);
                        break;
                }
                break;
                
            // Group Analytics commands
            case 'stats':
            case 'userstats':
            case 'exportstats':
            case 'resetstats':
                if (!isGroup) {
                    await sock.sendMessage(from, { text: '❌ Perintah ini hanya dapat digunakan di grup.' });
                    return;
                }
                switch (command) {
                    case 'stats':
                        await groupAnalyticsCommands.handleStats(sock, msg, args);
                        break;
                    case 'userstats':
                        await groupAnalyticsCommands.handleUserStats(sock, msg, args);
                        break;
                    case 'exportstats':
                        await groupAnalyticsCommands.handleExportStats(sock, msg);
                        break;
                    case 'resetstats':
                        await groupAnalyticsCommands.handleResetStats(sock, msg);
                        break;
                }
                break;
                
            // AI commands
            case 'ai':
            case 'chat':
            case 'ask':
            case 'generate':
            case 'create':
            case 'analyze':
            case 'analisis':
            case 'translate':
            case 'terjemah':
            case 'summarize':
            case 'ringkas':
            case 'explain':
            case 'jelaskan':
                await handleAICommand(sock, msg, command, args);
                break;
                
            // Weather commands
            case 'cuaca':
            case 'weather':
                await handleWeatherCommand(sock, msg, command, args);
                break;
                
            // Google Drive commands
            case 'drive':
            case 'upload':
            case 'download':
            case 'kknfiles':
            case 'listkkn':
            case 'drivelist':
            case 'drivesearch':
            case 'driveinfo':
            case 'driverename':
            case 'drivedelete':
            case 'drivestorage':
                const driveHandled = await driveCommand.handleDriveCommand(sock, msg);
                if (!driveHandled) {
                    // Fallback to old file command if not handled by drive
                    await handleFileCommand(sock, msg, command, args, filesDB);
                }
                break;
                
            // File manager commands (legacy)
            case 'files':
                await handleFileCommand(sock, msg, command, args, filesDB);
                break;
                
            // Media commands
            case 'sticker':
            case 's':
            case 'toimg':
            case 'toimage':
            case 'removebg':
            case 'nobg':
            case 'ocr':
            case 'readtext':
            case 'qr':
            case 'qrcode':
            case 'readqr':
            case 'scanqr':
            case 'ytdl':
            case 'youtube':
            case 'yt':
            case 'igdl':
            case 'instagram':
            case 'ig':
            case 'tiktok':
            case 'tt':
                await handleMediaCommand(sock, msg, command, args);
                break;
                
            // Menu command (mobile responsive)
            case '.menu':
            case 'menu':
            case 'help':
                await sendMobileMenu(sock, from);
                break;
                
            // Utility commands
            case 'ping':
            case 'uptime':
            case 'info':
            case 'stats':
            case 'news':
            case 'berita':
            case 'translate':
            case 'tr':
            case 'currency':
            case 'kurs':
            case 'calculator':
            case 'calc':
            case 'password':
            case 'pass':
            case 'timezone':
            case 'time':
            case 'shorturl':
            case 'short':
            case 'whois':
            case 'domain':
            case 'base64':
            case 'hash':
            case 'color':
            case 'warna':
            case 'ip':
            case 'ipinfo':
                await handleUtilsCommand(sock, msg, command, args, { financeDB, usersDB, groupsDB, filesDB });
                break;
                
            // Schedule commands
            case 'schedule':
            case 'reminder':
            case 'jadwal':
            case 'listschedule':
            case 'listjadwal':
            case 'deleteschedule':
            case 'hapusjadwal':
            case 'agenda':
            case 'meeting':
            case 'rapat':
            case 'deadline':
            case 'event':
            case 'acara':
                await handleScheduleCommand(sock, msg, command, args);
                break;
                
            // API Key Management commands (Admin only)
            case 'apikey':
            case 'apikeyinfo':
            case 'setapikey':
            case 'listapikey':
            case 'listapi':
            case 'rotateapi':
            case 'rotateapikey':
            case 'apistats':
            case 'apikeystats':
                await handleAPIKeyCommand(sock, msg, command, args, senderNumber, from);
                break;
                
            // User API Key Selection commands (All users)
            case 'pilihapi':
            case 'selectapi':
            case 'infoapi':
            case 'myapi':
            case 'resetapi':
            case 'availableapi':
                await handleUserAPIKeyCommand(sock, msg, senderNumber, command, args);
                break;
                
            case 'logs':
            case 'errorlog':
            case 'errors':
                console.log(`🔍 DEBUG Error Log Command:`);
                console.log(`  - Command: ${command}`);
                console.log(`  - Sender Number: ${senderNumber}`);
                console.log(`  - Admin Numbers: ${JSON.stringify(adminNumbers)}`);
                console.log(`  - Is Admin: ${isAdmin(senderNumber, adminNumbers)}`);
                
                if (isAdmin(senderNumber, adminNumbers)) {
                    console.log(`✅ Admin access granted for error log command`);
                    const recentErrors = errorLogger.getRecentErrors(20);
                    await sock.sendMessage(from, {
                        text: `📋 *Recent Error Log*\n\n\`\`\`\n${recentErrors}\n\`\`\`\n\n📝 Full logs available in: /logs/error.log`
                    });
                } else {
                    console.log(`❌ Access denied for error log command`);
                    await sock.sendMessage(from, {
                        text: '❌ *Akses Ditolak*\n\nHanya admin bot yang dapat melihat error log.'
                    });
                }
                break;
                
            default:
                await sock.sendMessage(from, {
                    text: `❓ *Command tidak ditemukan*\n\nGunakan *.help* untuk melihat daftar command yang tersedia.`
                });
        }
    } catch (error) {
        console.error('🚨 Error handling message:', error);
        console.log(`🔍 DEBUG Error Details:`);
        console.log(`  - Command: ${command}`);
        console.log(`  - Error: ${error.message}`);
        console.log(`  - Stack: ${error.stack}`);
        
        errorLogger.logError(error, {
            command,
            senderNumber,
            isGroup,
            messageText: body
        });
        
        await sock.sendMessage(from, {
            text: '❌ *Terjadi kesalahan*\n\nSilakan coba lagi atau hubungi admin.'
        });
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n🔄 Shutting down bot...'));
    
    // Save all databases
    await saveDatabase('finance.json', financeDB);
    await saveDatabase('users.json', usersDB);
    await saveDatabase('groups.json', groupsDB);
    await saveDatabase('files.json', filesDB);
    
    console.log(chalk.green('✅ Bot shutdown complete'));
    process.exit(0);
});

// Start the bot
startBot();

// Export for testing
module.exports = { sock, startBot };