
/* 
██╗░░░██╗██████╗░███╗░░░███╗░█████╗░██████╗░███████╗ 
██║░░░██║██╔══██╗████╗░████║██╔══██╗██╔══██╗╚════██║ 
██║░░░██║██║░░██║██╔████╔██║██║░░██║██║░░██║░░███╔═╝ 
██║░░░██║██║░░██║██║╚██╔╝██║██║░░██║██║░░██║██╔══╝░░ 
╚██████╔╝██████╔╝██║░╚═╝░██║╚█████╔╝██████╔╝███████╗ 
░╚═════╝░╚═════╝░╚═╝░░░░░╚═╝░╚════╝░╚═════╝░╚══════╝ 
By UDMODZ
DONT SELL
A FREE HACK
I'M UDMODZ


*/

const fs = require('fs');
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env' });

function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}
module.exports = {

        AUTO_VIEW_STATUS: 'true',
        AUTO_LIKE_STATUS: 'true',
        AUTO_RECORDING: 'true',
        AUTO_LIKE_EMOJI: ['🧩', '🍉', '💜', '🌸', '🪴', '💊', '💫', '🍂', '🌟', '🎋', '😶‍🌫️', '🫀', '🧿', '👀', '🤖', '🚩', '🥰', '🗿', '💜', '💙', '🌝', '🖤', '💚'],
        PREFIX: '.',
        MAX_RETRIES: 3,
        GROUP_INVITE_LINK: 'https://chat.whatsapp.com/IZ5klCZ038yEx4aoy6Be2y?mode=ems_copy_t',
        ADMIN_LIST_PATH: './admin.json',
        IMAGE_PATH: 'https://files.catbox.moe/qjae7t.jpg',
        NEWSLETTER_JID: '120363402466616623@newsletter',
        NEWSLETTER_MESSAGE_ID: '428',
        OTP_EXPIRY: 300000,
        NEWS_JSON_URL: '',
        BOT_NAME: 'FREEDOM-MINI-V2',
        OWNER_NAME: '#Dinux&Shagi',
        OWNER_NUMBER: '94740026280',
        BOT_VERSION: '2.0.0',
        BOT_FOOTER: '> © ꜰʀᴇᴇᴅᴏᴍ ᴍɪɴɪ ʙᴏᴛ',
        CHANNEL_LINK: 'https://whatsapp.com/channel/0029Vb6gcq74NVij8LWJKy1D',
        BUTTON_IMAGES: {
        ALIVE: 'https://files.catbox.moe/8fgv9x.jpg',
        MENU: 'https://files.catbox.moe/qjae7t.jpg',
        OWNER: 'https://files.catbox.moe/e08li4.jpg',
        SONG: 'https://files.catbox.moe/qjae7t.jpg',
        VIDEO: 'https://files.catbox.moe/qjae7t.jpg'
    }
};