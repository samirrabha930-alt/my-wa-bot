const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const http = require('http');
const QRCode = require('qrcode');

let qrCodeUrl = "";
let isConnected = false;

// Har user ke last reply time ko track karne ke liye Map
const repliedUsers = new Map();

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
        try {
            const msg = m.messages[0];
            if (!msg || !msg.message) return;

            // 1. Apne khud ke bheje hue messages ignore karein
            if (msg.key.fromMe) return;

            const from = msg.key.remoteJid;

            // 2. Group aur Broadcast messages ignore karein
            if (from.endsWith('@g.us') || from.includes('broadcast')) return;

            const now = Date.now();
            const COOLDOWN_TIME = 10 * 60 * 1000; // Exact 10 Minutes (600,000 ms)

            // 3. Cooldown logic check
            if (repliedUsers.has(from)) {
                const lastRepliedTime = repliedUsers.get(from);
                const timePassed = now - lastRepliedTime;

                if (timePassed < COOLDOWN_TIME) {
                    console.log(`User ${from} sent a message, but cooldown is active. (${Math.round((COOLDOWN_TIME - timePassed)/1000)} seconds remaining)`);
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

            // Record updated last reply time
            repliedUsers.set(from, now);
            console.log(`Auto-reply sent to ${from}. Next reply allowed in 10 minutes.`);

        } catch (err) {
            console.log("Error in message upsert:", err);
        }
    });
}

connectToWhatsApp();
