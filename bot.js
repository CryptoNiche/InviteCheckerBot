const { Telegraf } = require('telegraf');
const { google } = require('googleapis');

// === ENV VARIABLES ===
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID;

// === BOT ===
const bot = new Telegraf(BOT_TOKEN);

// === GOOGLE SHEETS SETUP ===
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// === IN-MEMORY TRACKING ===
let userCounts = {};
let lastSyncTime = null;

// === HELPER: SYNC TO SHEET ===
async function syncToSheet() {
  try {
    console.log('Syncing to Google Sheets...');
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:C',
    });

    const rows = res.data.values || [];

    for (let userId in userCounts) {
      const { name, count } = userCounts[userId];
      const rowIndex = rows.findIndex((r) => r[1] == userId);

      if (rowIndex === -1) {
        // Append new user
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: 'Sheet1!A:C',
          valueInputOption: 'RAW',
          resource: { values: [[name, userId, count]] },
        });
      } else {
        // Update existing user
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `Sheet1!C${rowIndex + 1}`,
          valueInputOption: 'RAW',
          resource: { values: [[count]] },
        });
      }
    }

    lastSyncTime = new Date().toISOString();
    console.log('Sync complete');
  } catch (err) {
    console.error('Error syncing to Sheets:', err.message);
  }
}

// === MESSAGE LISTENER ===
bot.on('text', async (ctx) => {
  // Ignore messages not from the target group
  if (ctx.chat.id.toString() !== TARGET_GROUP_ID) return;

  const text = ctx.message.text.trim().toLowerCase();

  if (text !== 'goodluck') return;

  const userId = ctx.from.id;
  const name = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '');
  const username = ctx.from.username || '';
  const timestamp = new Date().toISOString();
  const groupName = ctx.chat.title || '';

  // Update in-memory count
  if (!userCounts[userId]) {
    userCounts[userId] = { name, count: 1 };
  } else {
    userCounts[userId].count++;
  }

  // Log entry in "Logs" sheet
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Logs!A:E',
      valueInputOption: 'RAW',
      resource: {
        values: [[name, userId, username, timestamp, groupName]],
      },
    });
  } catch (err) {
    console.error('Error logging to Logs sheet:', err.message);
  }

  console.log(`GOODLUCK from ${name}`);
});

// === AUTO SYNC EVERY 2 MINUTES ===
setInterval(syncToSheet, 2 * 60 * 1000);

// === DAILY RESET AT MIDNIGHT SERVER TIME ===
setInterval(() => {
  console.log('Daily reset executed');
  userCounts = {};
}, 24 * 60 * 60 * 1000);

// === COMMANDS ===

// /start
bot.start((ctx) => {
  ctx.reply('🤖 Bot is running. It tracks "goodluck" messages in the target group.');
});

// /health
bot.command('health', (ctx) => {
  if (ctx.chat.type === 'private') {
    // Allow DM check
    ctx.reply(
      `🤖 Bot is alive\n` +
      `👥 Users tracked in memory: ${Object.keys(userCounts).length}\n` +
      `🕒 Last sync: ${lastSyncTime || 'Not yet'}`
    );
  } else if (ctx.chat.id.toString() === TARGET_GROUP_ID) {
    // Group health
    ctx.reply(
      `✅ Bot is alive in this group\n` +
      `👥 Users tracked: ${Object.keys(userCounts).length}\n` +
      `🕒 Last sync: ${lastSyncTime || 'Not yet'}`
    );
  }
});

// /sync
bot.command('sync', async (ctx) => {
  await syncToSheet();
  ctx.reply('✅ Manual sync completed');
});

// === START BOT ===
bot.launch().then(() => console.log('Bot running'));

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
