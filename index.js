const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    // BINA QR CODE KE PAIRING CODE GENERATE KARNE KE LIYE:
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            // Yahan apna WhatsApp number daalein (Country code ke sath, e.g. +918136004933)
            const phoneNumber = "+918136004933"; 
            const code = await sock.requestPairingCode(phoneNumber);
            console.log(`=================================`);
            console.log(`AAPKA PAIRING CODE HAI: ${code}`);
            console.log(`=================================`);
        }, 3000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log('Connection closed, reconnecting...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('WhatsApp Bot Ready Hai!');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.key.fromMe && m.type === 'notify') {
            const from = msg.key.remoteJid;
            await sock.sendMessage(from, { text: 'Please wait, hum jald hi aapko reply karenge.' });
        }
    });
}

connectToWhatsApp();
                
