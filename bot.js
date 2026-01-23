const TelegramBot = require("node-telegram-bot-api");

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
    console.error("Error: BOT_TOKEN not set!");
    process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// --- STATE ---
const userGroups = {};      // userId -> { chatId: chatTitle }
let targetGroupId = null;   // selected group
const goodluckCounts = {};  // userId -> { name, count }

// --- START ---
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (msg.chat.type !== "private") {
        return bot.sendMessage(chatId, "⚡ Please DM me to select the target group.");
    }

    const groups = userGroups[userId] || {};
    if (Object.keys(groups).length === 0) {
        return bot.sendMessage(chatId, "⚠️ No groups detected. Send a message in a group where I'm added first.");
    }

    const buttons = Object.entries(groups).map(([id, title]) => [
        { text: title, callback_data: `set_target_${id}` }
    ]);

    bot.sendMessage(chatId, "Select the target group for 'goodluck' tracking:", {
        reply_markup: { inline_keyboard: buttons }
    });
});

// --- AUTO REGISTER GROUPS ---
bot.on("message", (msg) => {
    const chat = msg.chat;
    const chatId = chat.id;
    const userId = msg.from.id;

    // Register groups automatically
    if (chat.type === "group" || chat.type === "supergroup") {
        if (!userGroups[userId]) userGroups[userId] = {};
        userGroups[userId][chatId] = chat.title || "Unnamed Group";
    }

    // Track "goodluck" messages in target group
    if (chat.type === "group" || chat.type === "supergroup") {
        if (targetGroupId && chatId.toString() === targetGroupId) {
            if (msg.text && msg.text.toLowerCase() === "goodluck") {
                const name = msg.from.first_name + (msg.from.last_name ? ` ${msg.from.last_name}` : "");
                if (!goodluckCounts[msg.from.id]) goodluckCounts[msg.from.id] = { name, count: 1 };
                else goodluckCounts[msg.from.id].count++;

                console.log(`GOODLUCK from ${name} | Total: ${goodluckCounts[msg.from.id].count}`);
            }
        }
    }
});

// --- INLINE BUTTON HANDLER ---
bot.on("callback_query", (query) => {
    const userId = query.from.id;
    const data = query.data;

    if (data.startsWith("set_target_")) {
        targetGroupId = data.replace("set_target_", "");
        bot.editMessageText(`✅ Group set for 'goodluck': ${userGroups[userId][targetGroupId]}`, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id
        });
        bot.answerCallbackQuery(query.id);
    }
});

console.log("🤖 Bot running...");
