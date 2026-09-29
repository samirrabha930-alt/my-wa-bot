const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const http = require('http');
const QRCode = require('qrcode');

let qrCodeUrl = "";
let isConnected = false;

// Auto-reply Cooldown map (Har user ka last reply time track karne ke liye)
const repliedUsers = new Map();

// Web server for QR Code display
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
            console.log("New QR Code generated! Open service URL in browser.");
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
        const msg = m.messages[0];

        if (!msg || !msg.message) return;

        // 1. Aapke khud ke bheje hue messages ignore karein
        if (msg.key.fromMe) return;

        const from = msg.key.remoteJid;

        // 2. Group aur Broadcast messages ignore karein
        if (from.endsWith('@g.us') || from === 'status@broadcast') return;

        // 3. Exact 10 Minutes Cooldown (10 * 60 * 1000 ms)
        const now = Date.now();
        const COOLDOWN_TIME = 10 * 60 * 1000; // 10 Minutes in milliseconds

        if (repliedUsers.has(from)) {
            const lastRepliedTime = repliedUsers.get(from);
            if (now - lastRepliedTime < COOLDOWN_TIME) {
                // Agar last message ko 10 minute se kam hue hain, toh reply na karein
                return;
            }
        }

        // Auto-reply message
        const autoReplyMessage = 
`🤖 Hello! Main Boss ka personal bot hoon.
📩 Aapka message mil gaya hai.
👨‍💼 Mera Boss abhi online hai to woh aapko jaldi reply karega.
⏳ Agar abhi reply na mile, thoda wait kijiye.
🙏 Thank you for contacting us!`;

        await sock.sendMessage(from, { text: autoReplyMessage });

        // User ka timing record karein
        repliedUsers.set(from, now);
    });
}

connectToWhatsApp();
            
