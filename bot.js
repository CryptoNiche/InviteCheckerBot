const { Telegraf } = require('telegraf');
const { google } = require('googleapis');

// === Load Environment Variables ===
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// === Telegram Bot Setup ===
const bot = new Telegraf(BOT_TOKEN);

// === Google Sheets Setup ===
const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// === In-memory tracker ===
let userCounts = {}; // { user_id: { name, count } }

// === Listen to Telegram messages ===
bot.on('text', (ctx) => {
    const message = ctx.message.text.trim().toLowerCase();

    if (message === 'goodluck') {
        const userId = ctx.from.id;
        const userName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '');

        if (!userCounts[userId]) {
            userCounts[userId] = { name: userName, count: 1 };
        } else {
            userCounts[userId].count += 1;
        }

        console.log(`${userName} (${userId}) sent goodluck! Total in memory: ${userCounts[userId].count}`);
    }
});

// === Batch sync function (every 2 minutes) ===
async function syncToSheet() {
    try {
        console.log('Starting batch sync to Google Sheets...');

        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Sheet1!A:C'
        });

        const rows = res.data.values || [];

        for (let userId in userCounts) {
            const { name, count } = userCounts[userId];
            const rowIndex = rows.findIndex(row => row[1] == userId);

            if (rowIndex === -1) {
                // Append new user
                await sheets.spreadsheets.values.append({
                    spreadsheetId: SPREADSHEET_ID,
                    range: 'Sheet1!A:C',
                    valueInputOption: 'RAW',
                    resource: { values: [[name, userId, count]] }
                });
            } else {
                // Update existing count
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `Sheet1!C${rowIndex + 1}`,
                    valueInputOption: 'RAW',
                    resource: { values: [[count]] }
                });
            }
        }

        console.log('Batch sync completed!');
    } catch (err) {
        console.error('Error syncing to Google Sheets:', err);
    }
}

// === Schedule sync every 2 minutes ===
setInterval(syncToSheet, 2 * 60 * 1000); // 2 minutes

// === Start Telegram bot ===
bot.launch().then(() => console.log('Telegram Goodluck bot is running!'));

// === Graceful shutdown ===
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
