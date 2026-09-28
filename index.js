const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp Bot Ready Hai!');
});

client.on('message', async msg => {
    // Har kisi ko auto-reply bhejne ke liye
    msg.reply('Please wait, hum jald hi aapko reply karenge.');
});

client.initialize();
