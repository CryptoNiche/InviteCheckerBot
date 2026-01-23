require('dotenv').config(); // load .env variables
const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');
const fs = require('fs');

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) throw new Error("BOT_TOKEN not set!");

const bot = new TelegramBot(TOKEN, { polling: true });

// ---------- SUPER ADMINS ----------
const SUPER_ADMINS = [933749968]; // put your Telegram ID(s) here

// ---------- BATCHING FOR GOOGLE SHEETS ----------
let batchUpdates = [];
const BATCH_INTERVAL = 2 * 60 * 1000; // 2 minutes

// ---------- GROUP REGISTRATION ----------
const broadcastGroups = {}; // userId => { chatId: groupTitle }

// ---------- GOOGLE SHEET SETUP ----------
const SHEET_ID = process.env.SHEET_ID;
const creds = JSON.parse(fs.readFileSync('./credentials.json'));
const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// ---------- HELPER: append to sheet ----------
async function appendToSheet(username, chatTitle, timestamp) {
    batchUpdates.push([username, chatTitle, timestamp]);
}

// ---------- FLUSH BATCH TO SHEET ----------
async function flushBatch() {
    if (!batchUpdates.length) return;

    try {
        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'Sheet1!A:C',
            valueInputOption: 'RAW',
            requestBody: {
                values: batchUpdates,
            },
        });
        console.log(`✅ Flushed ${batchUpdates.length} rows to Google Sheets`);
        batchUpdates = [];
    } catch (err) {
        console.error('❌ Failed to flush batch:', err.message);
    }
}

// flush every 2 minutes
setInterval(flushBatch, BATCH_INTERVAL);

// ---------- BUTTONS ----------
const buttons = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "Select Target Group", callback_data: "select_group" }],
        ],
    },
};

// ---------- INLINE GROUP SELECTION ----------
bot.on('callback_query', async (query) => {
    const userId = query.from.id;
    const data = query.data;

    if (data === 'select_group') {
        const myGroups = broadcastGroups[userId] || {};
        if (!Object.keys(myGroups).length) {
            await bot.answerCallbackQuery(query.id, { text: "⚠️ No groups detected yet.", show_alert: true });
            return;
        }

        const keyboard = Object.entries(myGroups).map(([chatId, title]) => ([{
            text: title,
            callback_data: `target_${chatId}`
        }]));

        await bot.sendMessage(userId, '📣 Select the target group:', { reply_markup: { inline_keyboard: keyboard } });
        await bot.answerCallbackQuery(query.id);
        return;
    }

    if (data.startsWith('target_')) {
        const chatId = data.replace('target_', '');
        bot.sendMessage(userId, `✅ Target group set: ${broadcastGroups[userId][chatId]}`);
        broadcastGroups[userId].selected = chatId; // mark selected target
        await bot.answerCallbackQuery(query.id);
    }
});

// ---------- /start and /health ----------
bot.onText(/\/start/, (msg) => {
    if (msg.chat.type !== 'private') return;
    bot.sendMessage(msg.chat.id, "⚡ Bot is alive! Choose an option:", buttons);
});

bot.onText(/\/health/, (msg) => {
    bot.sendMessage(msg.chat.id, "🤖 I'm alive!");
});

// ---------- MESSAGE HANDLER ----------
bot.on('message', async (msg) => {
    const chat = msg.chat;
    const chatId = chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'Unknown';

    // ---------- REGISTER GROUPS ----------
    if (chat.type === 'group' || chat.type === 'supergroup') {
        if (!broadcastGroups[userId]) broadcastGroups[userId] = {};
        broadcastGroups[userId][chatId] = chat.title || 'Unnamed Group';
    }

    // ---------- ONLY TRACK GOODLUCK ----------
    if ((msg.text || '').toLowerCase().includes('goodluck')) {
        const selectedChat = broadcastGroups[userId]?.selected;
        // Only log if the group is the selected target
        if (selectedChat && parseInt(selectedChat) === chatId) {
            const ts = new Date().toISOString();
            await appendToSheet(username, chat.title, ts);
            console.log(`📌 Logged goodluck from ${username} in ${chat.title}`);
        }
    }
});
