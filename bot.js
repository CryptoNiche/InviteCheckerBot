const { Telegraf, Markup } = require('telegraf');

// === ENV VARIABLES ===
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set!');
  process.exit(1);
}

// === INIT BOT ===
const bot = new Telegraf(BOT_TOKEN);

// === IN-MEMORY STATE ===
let targetGroupId = null; // will be set via inline button
let userCounts = {};

// /start command
bot.start((ctx) => {
  ctx.reply('🤖 Bot is alive. Add me to a group to start tracking "goodluck".');
});

// /health command (works in DM)
bot.command('health', (ctx) => {
  ctx.reply(
    `✅ Bot is alive\n` +
    `👥 Users tracked: ${Object.keys(userCounts).length}\n` +
    `🎯 Target group: ${targetGroupId || 'Not set'}`
  );
});

// Detect any message in a group
bot.on('text', (ctx) => {
  const chat = ctx.chat;

  // Only process group messages
  if (chat.type === 'group' || chat.type === 'supergroup') {
    // If target group not set, show inline button
    if (!targetGroupId) {
      ctx.reply(
        `Do you want to set this group "${chat.title}" as the target group?`,
        Markup.inlineKeyboard([
          Markup.button.callback('✅ Set as target group', `set_target_${chat.id}`)
        ])
      );
      return;
    }

    // If this is the target group, track "goodluck"
    if (chat.id.toString() === targetGroupId) {
      const text = ctx.message.text.trim().toLowerCase();
      if (text === 'goodluck') {
        const userId = ctx.from.id;
        const name = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '');
        if (!userCounts[userId]) userCounts[userId] = { name, count: 1 };
        else userCounts[userId].count++;

        console.log(`GOODLUCK from ${name} | Total: ${userCounts[userId].count}`);
      }
    }
  }
});

// Handle inline button callback
bot.action(/set_target_(.+)/, (ctx) => {
  const groupId = ctx.match[1]; // captured from callback_data
  targetGroupId = groupId;
  ctx.editMessageText(`✅ This group is now set as the target group for tracking "goodluck".`);
  console.log(`Target group set: ${ctx.chat.title} (${targetGroupId})`);
});

// START BOT
bot.launch().then(() => console.log('Bot running'));

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
