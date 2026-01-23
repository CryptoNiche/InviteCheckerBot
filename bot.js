const { Telegraf } = require('telegraf');

// === ENV VARIABLES ===
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID; // must be set in Railway

if (!BOT_TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set!');
  process.exit(1);
}

if (!TARGET_GROUP_ID) {
  console.error('Error: TARGET_GROUP_ID is not set!');
  process.exit(1);
}

// === INIT BOT ===
const bot = new Telegraf(BOT_TOKEN);

// === IN-MEMORY COUNTS ===
let userCounts = {};

// /start command
bot.start((ctx) => {
  ctx.reply('🤖 Bot is alive and responding ✅');
});

// /health command
bot.command('health', (ctx) => {
  ctx.reply(
    `✅ Bot is alive\n` +
    `👥 Users tracked in memory: ${Object.keys(userCounts).length}`
  );
});

// Track "goodluck" messages in the TARGET_GROUP
bot.on('text', (ctx) => {
  // Only track messages in the target group
  if (ctx.chat.id.toString() !== TARGET_GROUP_ID) return;

  const text = ctx.message.text.trim().toLowerCase();

  if (text !== 'goodluck') return;

  const userId = ctx.from.id;
  const name = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '');

  // Update in-memory count
  if (!userCounts[userId]) {
    userCounts[userId] = { name, count: 1 };
  } else {
    userCounts[userId].count++;
  }

  console.log(`GOODLUCK from ${name} | Total: ${userCounts[userId].count}`);
});

// START BOT
bot.launch().then(() => console.log('Bot running'));

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
