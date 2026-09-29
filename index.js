const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const http = require('http');
const QRCode = require('qrcode');

let qrCodeUrl = "";
let isConnected = false;

// 10-Minute Cooldown Tracker Map
const repliedUsers = new Map();

// Web server for QR Code display on Render
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
                <p><b>Note:</b> If scan fails, refresh page for fresh QR code.</p>
            </div>
        `);
    } else {
        res.end('<h2 style="text-align:center;margin-top:20%;">Generating QR Code... Please refresh in 5 seconds.</h2>');
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

// Native Self-Ping to prevent Render Free Server from sleeping
setInterval(() => {
    http.get('http://localhost:' + PORT, () => {
        console.log("Self-ping successful. Server awake!");
    }).on('error', () => {});
}, 4 * 60 * 1000); // Ping every 4 minutes

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
            console.log("New QR Code generated successfully!");
        }

        if (connection === 'close') {
            isConnected = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed, reconnecting...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            isConnected = true;
            qrCodeUrl = "";
            console.log('WhatsApp Bot Active Ho Gaya!');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        try {
            const msg = m.messages[0];
            if (!msg || !msg.message) return;

            // 1. Own sent messages ignore
            if (msg.key.fromMe) return;

            const rawJid = msg.key.remoteJid;

            // 2. Groups & Broadcast ignore
            if (!rawJid || rawJid.endsWith('@g.us') || rawJid.includes('broadcast')) return;

            // Clean User ID to avoid LID vs PN issue
            const userId = rawJid.split('@')[0].split(':')[0];
            const now = Date.now();
            const COOLDOWN_TIME = 10 * 60 * 1000; // 10 Minutes in ms

            // 3. Cooldown check
            if (repliedUsers.has(userId)) {
                const lastRepliedTime =RepliedUsers.get(userId);
                if (now - lastRepliedTime < COOLDOWN_TIME) {
                    return; // 10 min cooldown active
                }
            }

            // Custom Message
            const autoReplyMessage = 
`🤖 Hello! Main Boss ka personal bot hoon.
📩 Aapka message mil gaya hai.
👨‍💼 Mera Boss abhi online hai to woh aapko jaldi reply karega.
⏳ Agar abhi reply na mile, thoda wait kijiye.
🙏 Thank you for contacting us!`;

            await sock.sendMessage(rawJid, { text: autoReplyMessage });

            // Store last sent timestamp
            repliedUsers.set(userId, now);

        } catch (err) {
            console.log("Error handling message:", err);
        }
    });
}

connectToWhatsApp();
                
