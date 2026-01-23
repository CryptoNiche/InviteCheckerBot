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
let targetGroupId = null; // group where goodluck will be tracked
let groups = {}; // chatId -> title for all groups bot is in
let userCounts = {}; // userId -> { name, count }

// === /start in DM ===
bot.start(async (ctx) => {
  if (ctx.chat.type !== 'private') {
    return ctx.reply('🤖 Use /start in a private chat with me to select target group.');
  }

  // List all known groups
  if (Object.keys(groups).length === 0) {
    return ctx.reply('🤖 I am not in any groups yet. Add me to a group first!');
  }

  // Build inline buttons for each group
  const buttons = Object.entries(groups).map(([id, title]) =>
    Markup.button.callback(title, `set_target_${id}`)
  );

  await ctx.reply(
    'Select the group where you want to track "goodluck":',
    Markup.inlineKeyboard(buttons, { columns: 1 })
  );
});

// === /health command in DM ===
bot.command('health', (ctx) => {
  ctx.reply(
    `✅ Bot is alive\n` +
    `🎯 Target group: ${targetGroupId ? groups[targetGroupId] : 'Not set'}\n` +
    `👥 Users tracked in memory: ${Object.keys(userCounts).length}`
  );
});

// === Track groups the bot is added to ===
bot.on('new_chat_members', (ctx) => {
  const chat = ctx.chat;
  if (chat.type === 'group' || chat.type === 'supergroup') {
    groups[chat.id] = chat.title;
    console.log(`Added to group: ${chat.title} (${chat.id})`);
  }
});

// Also detect any message in groups to register the group
bot.on('text', (ctx) => {
  const chat = ctx.chat;
  if (chat.type === 'group' || chat.type === 'supergroup') {
    groups[chat.id] = chat.title;

    // Only track messages in target group
    if (targetGroupId && chat.id.toString() === targetGroupId) {
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

// === Handle inline button to set target group ===
bot.action(/set_target_(.+)/, (ctx) => {
  const groupId = ctx.match[1];
  if (!groups[groupId]) {
    return ctx.reply('❌ Group not found.');
  }

  targetGroupId = groupId;
  ctx.editMessageText(`✅ "${groups[groupId]}" is now set as the target group for "goodluck" tracking.`);
  console.log(`Target group set: ${groups[groupId]} (${targetGroupId})`);
});

// === START BOT ===
bot.launch().then(() => console.log('Bot running'));

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
