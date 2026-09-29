const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const http = require('http');
const QRCode = require('qrcode');
const axios = require('axios'); // For keeping server awake

let qrCodeUrl = "";
let isConnected = false;

// Cooldown tracking Map (RAM me store hoga aur server awake rahega)
const repliedUsers = new Map();

// Web server for Render
const server = http.createServer(async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    if (isConnected) {
        res.end('<h1 style="color:green;text-align:center;margin-top:20%;">WhatsApp Bot Connected & Active!</h1>');
    } else if (qrCodeUrl) {
        res.end(`
            <div style="text-align:center;margin-top:10%;">
                <h2>Scan WhatsApp QR Code</h2>
                <img src="${qrCodeUrl}" style="width:300px;height:300px;border:2px solid #000;" />
                <p>Open WhatsApp > Linked Devices > Link a Device > Scan this QR</p>
            </div>
        `);
    } else {
        res.end('<h2 style="text-align:center;margin-top:20%;">Generating QR Code... Please refresh in 5 seconds.</h2>');
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

// ==========================================
// RENDER SLEEP FIX: Keep server awake 24/7
// ==========================================
setInterval(async () => {
    try {
        // Replace with your Render URL
        await axios.get('https://my-wa-bot-14.onrender.com'); 
        console.log("Ping sent to keep server awake.");
    } catch (err) {
        console.log("Ping failed (server awake check).");
    }
}, 5 * 60 * 1000); // Har 5 minute me khud ko ping karega

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: require('pino')({ level: 'silent' }),
        browser: Browsers.macOS('Desktop')
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodeUrl = await QRCode.toDataURL(qr);
            console.log("New QR Code generated!");
        }

        if (connection === 'close') {
            isConnected = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            isConnected = true;
            qrCodeUrl = "";
            console.log('WhatsApp Bot Active!');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        try {
            const msg = m.messages[0];
            if (!msg || !msg.message) return;

            // 1. Khud ke messages ignore karein
            if (msg.key.fromMe) return;

            const rawJid = msg.key.remoteJid;

            // 2. Groups aur Broadcast messages ignore karein
            if (!rawJid || rawJid.endsWith('@g.us') || rawJid.includes('broadcast')) return;

            const userId = rawJid.split('@')[0].split(':')[0];
            const now = Date.now();
            const COOLDOWN_TIME = 10 * 60 * 1000; // 10 Minutes 

            // 3. Cooldown Check
            if (repliedUsers.has(userId)) {
                const lastRepliedTime = repliedUsers.get(userId);
                const timePassed = now - lastRepliedTime;

                if (timePassed < COOLDOWN_TIME) {
                    console.log(`[Cooldown] Ignored message from ${userId}`);
                    return; // 10 minute nahi hue, isliye reply nahi dega
                }
            }

            // Auto-reply message
            const autoReplyMessage = 
`🤖 Hello! Main Boss ka personal bot hoon.
📩 Aapka message mil gaya hai.
👨‍💼 Mera Boss abhi online hai to woh aapko jaldi reply karega.
⏳ Agar abhi reply na mile, thoda wait kijiye.
🙏 Thank you for contacting us!`;

            await sock.sendMessage(rawJid, { text: autoReplyMessage });

            // Timestamp save karein
            repliedUsers.set(userId, now);
            console.log(`[REPLY SENT] to ${userId}. Next valid reply in 10 minutes.`);

        } catch (err) {
            console.log("Error in message upsert:", err);
        }
    });
}

connectToWhatsApp();
