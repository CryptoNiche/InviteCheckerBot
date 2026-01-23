const { Telegraf } = require('telegraf');

// === TELEGRAM BOT TOKEN ===
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set!');
  process.exit(1);
}

// === INIT BOT ===
const bot = new Telegraf(BOT_TOKEN);

// /start command
bot.start((ctx) => {
  console.log('Received /start from:', ctx.from.username || ctx.from.first_name);
  ctx.reply('🤖 Bot is alive and responding ✅');
});

// /health command
bot.command('health', (ctx) => {
  console.log('Received /health from:', ctx.from.username || ctx.from.first_name);
  ctx.reply('✅ Bot is healthy and running');
});

// Echo any other message
bot.on('text', (ctx) => {
  console.log('Received message from:', ctx.from.username || ctx.from.first_name, 'Text:', ctx.message.text);
  ctx.reply('You said: ' + ctx.message.text);
});

// START BOT
bot.launch().then(() => console.log('Bot running'));

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); // ✅ FIXED
