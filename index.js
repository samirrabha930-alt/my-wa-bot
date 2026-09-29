const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const http = require('http');
const QRCode = require('qrcode');

let qrCodeUrl = "";
let isConnected = false;

// Cooldown tracking Map
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

            // 1. Khud ke bheje gaye messages ignore karein
            if (msg.key.fromMe) return;

            const rawJid = msg.key.remoteJid;

            // 2. Groups aur Broadcast messages ignore karein
            if (!rawJid || rawJid.endsWith('@g.us') || rawJid.includes('broadcast')) return;

            // 3. User ID ko clean pure phone number/ID me convert karein (LID vs PN fix)
            const userId = rawJid.split('@')[0].split(':')[0];

            const now = Date.now();
            const COOLDOWN_TIME = 10 * 60 * 1000; // Exact 10 Minutes (600,000 ms)

            // 4. Cooldown Check
            if (repliedUsers.has(userId)) {
                const lastRepliedTime = repliedUsers.get(userId);
                const timePassed = now - lastRepliedTime;

                if (timePassed < COOLDOWN_TIME) {
                    console.log(`[Cooldown Active] ${userId} - ${Math.round((COOLDOWN_TIME - timePassed)/1000)} seconds remaining`);
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

            await sock.sendMessage(rawJid, { text: autoReplyMessage });

            // Update user reply timestamp
            repliedUsers.set(userId, now);
            console.log(`[SUCCESS] Reply sent to ${userId}. Next reply in 10 minutes.`);

        } catch (err) {
            console.log("Error in message upsert:", err);
        }
    });
}

connectToWhatsApp();
