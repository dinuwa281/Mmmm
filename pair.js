
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, proto, prepareWAMessageMedia, generateWAMessageFromContent, delay } = require('@whiskeysockets/baileys');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');


const router = express.Router();
const config = require('./settings'); // assume config file exists

// ================= MongoDB Setup =================
const mongoUri = 'mongodb+srv://shanuka:Shanuka@cluster0.i9l2lts.mongodb.net/;';
const client = new MongoClient(mongoUri);
let db;

async function initMongo() {
    if (!db) {
        await client.connect();
        db = client.db('Shanuka');
        await db.collection('sessions').createIndex({ number: 1 });
    }
    return db;
}

// ================= Utilities =================
function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

function capital(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

async function resize(image, width, height) {
    let oyy = await Jimp.read(image);
    return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';

if (!fs.existsSync(SESSION_BASE_PATH)) fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });

// ================= Plugin Loader =================
function loadPlugins() {
    const plugins = new Map();
    const pluginFiles = fs.readdirSync(path.join(__dirname, "plugins")).filter(f => f.endsWith(".js"));
    for (const file of pluginFiles) {
        try {
            const plugin = require(path.join(__dirname, "plugins", file));
            if (plugin.name && typeof plugin.run === "function") {
                plugins.set(plugin.name, plugin);
                if (plugin.aliases && Array.isArray(plugin.aliases)) {
                    plugin.aliases.forEach(alias => plugins.set(alias, plugin));
                }
            }
        } catch (err) {
            console.error(`❌ Failed to load plugin ${file}:`, err);
        }
    }
    return plugins;
}

// ================= Command Handlers =================
function setupCommandHandlers(socket, number) {
    const plugins = loadPlugins();
    socket.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        const isNewsletter = config.NEWSLETTER_JIDS.includes(msg.key?.remoteJid);
        if (!msg.message || msg.key.remoteJid === "status@broadcast" || isNewsletter) return;

        let command = null;
        let args = [];
        let sender = msg.key.remoteJid;

        if (msg.message.conversation || msg.message.extendedTextMessage?.text) {
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
            if (text.startsWith(config.PREFIX)) {
                const parts = text.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        } else if (msg.message.buttonsResponseMessage) {
            const buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            if (buttonId && buttonId.startsWith(config.PREFIX)) {
                const parts = buttonId.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }

        if (!command) return;

        try {
            const plugin = plugins.get(command);
            if (plugin) await plugin.run(socket, msg, args, sender);
        } catch (err) {
            console.error("❌ Plugin error:", err);
        }
    });
}

// ================= Session Management =================
async function deleteSessionFromMongo(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const db = await initMongo();
        const collection = db.collection('sessions');
        await collection.deleteOne({ number: sanitizedNumber });
        console.log(`Deleted session for ${sanitizedNumber} from MongoDB`);
    } catch (error) {
        console.error('Failed to delete session from MongoDB:', error);
    }
}

async function renameCredsOnLogout(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const db = await initMongo();
        const collection = db.collection('sessions');
        const count = (await collection.countDocuments({ active: false })) + 1;
        await collection.updateOne(
            { number: sanitizedNumber },
            { $rename: { "creds": `delete_creds${count}` }, $set: { active: false } }
        );
        console.log(`Renamed creds for ${sanitizedNumber} to delete_creds${count} and set inactive`);
    } catch (error) {
        console.error('Failed to rename creds on logout:', error);
    }
}

async function restoreSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const db = await initMongo();
        const collection = db.collection('sessions');
        const doc = await collection.findOne({ number: sanitizedNumber, active: true });
        if (!doc) return null;
        return JSON.parse(doc.creds);
    } catch (error) {
        console.error('Session restore failed:', error);
        return null;
    }
}

// ================= Auto Restart Handler =================
function setupAutoRestart(socket, number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === 401) {
                console.log(`Connection closed due to logout for ${number}`);
                await renameCredsOnLogout(number);
                activeSockets.delete(sanitizedNumber);
                socketCreationTime.delete(sanitizedNumber);
            } else {
                console.log(`Connection lost for ${number}, attempting to reconnect...`);
                activeSockets.delete(sanitizedNumber);
                socketCreationTime.delete(sanitizedNumber);
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(number, mockRes);
            }
        } else if (connection === 'open') {
            if (config.SEND_CONNECT_MESSAGE === 'true') {
                try {
                    const userJid = jidNormalizedUser(socket.user.id);
                    await socket.sendMessage(userJid, { text: `✅ Connected Successfully!\nNumber: ${sanitizedNumber}` });
                } catch (err) {
                    console.error("❌ Failed to send connect message:", err);
                }
            }
        }
    });
}

// ================= Empire Pair (Main Function) =================
async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    await fs.ensureDir(path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`));
    const restoredCreds = await restoreSession(sanitizedNumber);
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    if (restoredCreds) {
        await fs.writeFile(path.join(sessionPath, 'creds.json'), JSON.stringify(restoredCreds, null, 2));
        console.log(`Successfully restored session for ${sanitizedNumber}`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });
    const socket = makeWASocket({
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        printQRInTerminal: false,
        logger,
        browser: Browsers.macOS('Safari')
    });

    socketCreationTime.set(sanitizedNumber, Date.now());

    // Setup handlers
    setupCommandHandlers(socket, sanitizedNumber);
    setupAutoRestart(socket, sanitizedNumber);

    // Save creds to MongoDB
    socket.ev.on('creds.update', async () => {
        await saveCreds();
        const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
        const db = await initMongo();
        const collection = db.collection('sessions');
        const sessionId = uuidv4();
        await collection.updateOne(
            { number: sanitizedNumber },
            { $set: { sessionId, number: sanitizedNumber, creds: fileContent, active: true, updatedAt: new Date() } },
            { upsert: true }
        );
        console.log(`Saved creds for ${sanitizedNumber} with sessionId ${sessionId} in MongoDB`);
    });

    activeSockets.set(sanitizedNumber, socket);
}

// ================= Express Routes =================
router.get('/', async (req, res) => {
    const { number, force } = req.query;
    if (!number) return res.status(400).send({ error: 'Number parameter is required' });

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    if (activeSockets.has(sanitizedNumber)) return res.status(200).send({ status: 'already_connected' });

    if (force === 'true') {
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        await deleteSessionFromMongo(sanitizedNumber);
        if (fs.existsSync(sessionPath)) await fs.remove(sessionPath);
    }

    await EmpirePair(number, res);
    res.status(200).send({ status: 'initiated', number: sanitizedNumber });
});

router.get('/active', (req, res) => {
    res.status(200).send({ count: activeSockets.size, numbers: Array.from(activeSockets.keys()) });
});

router.get('/ping', (req, res) => {
    res.status(200).send({ status: 'active', message: 'BOT is running', activesession: activeSockets.size });
});

// ================= Cleanup =================
process.on('exit', () => {
    activeSockets.forEach((socket, number) => socket.ws.close());
    activeSockets.clear();
    socketCreationTime.clear();
    fs.emptyDirSync(SESSION_BASE_PATH);
    client.close();
});

process.on('uncaughtException', async (err) => {
    console.error('Uncaught exception:', err);
    exec(`pm2 restart ${process.env.PM2_NAME || 'BOT-session'}`);
});

// ================= Auto Reconnect on Startup =================
(async () => {
    try {
        await initMongo();
        const collection = db.collection('sessions');
        const docs = await collection.find({ active: true }).toArray();
        for (const doc of docs) {
            const number = doc.number;
            if (!activeSockets.has(number)) {
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(number, mockRes);
            }
        }
        console.log('Auto-reconnect completed on startup');
    } catch (error) {
        console.error('Failed to auto-reconnect on startup:', error);
    }
})();

module.exports = router;
