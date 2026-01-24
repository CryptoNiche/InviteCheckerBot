const TelegramBot = require("node-telegram-bot-api");

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
    console.error("Error: BOT_TOKEN not set!");
    process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ---------------- STATE ----------------
const userGroups = {};        // userId -> { chatId: title }
const userTargetGroup = {};   // userId -> chatId
const goodluckCounts = {};    // userId -> { name, count }

// ---------------- /start ----------------
bot.onText(/\/start/, (msg) => {
    if (msg.chat.type !== "private") return;

    const userId = msg.from.id;
    const groups = userGroups[userId] || {};

    if (Object.keys(groups).length === 0) {
        return bot.sendMessage(
            msg.chat.id,
            "⚠️ No groups detected yet.\nSend any message in a group where I'm added."
        );
    }

    const keyboard = Object.entries(groups).map(([id, title]) => ([
        { text: title, callback_data: `select_${id}` }
    ]));

    bot.sendMessage(msg.chat.id, "📌 Select target group:", {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// ---------------- GROUP DETECTION ----------------
bot.on("message", (msg) => {
    const chat = msg.chat;
    const chatId = chat.id;
    const userId = msg.from.id;

    // 🔥 SAME AS YOUR WORKING BOT
    if (chat.type === "group" || chat.type === "supergroup") {
        if (!userGroups[userId]) userGroups[userId] = {};
        userGroups[userId][chatId] = chat.title || "Unnamed Group";
        console.log("📡 Detected group:", chat.title);
    }

    // Track "goodluck"
    const target = userTargetGroup[userId];
    if (
        target &&
        chatId === target &&
        msg.text &&
        msg.text.toLowerCase() === "goodluck"
    ) {
        const name = msg.from.username || msg.from.first_name;

        if (!goodluckCounts[userId]) {
            goodluckCounts[userId] = { name, count: 1 };
        } else {
            goodluckCounts[userId].count++;
        }

        console.log(`🍀 GOODLUCK from ${name} (${goodluckCounts[userId].count})`);
    }
});

// ---------------- INLINE BUTTONS ----------------
bot.on("callback_query", (query) => {
    const userId = query.from.id;
    const data = query.data;

    if (data.startsWith("select_")) {
        const chatId = Number(data.replace("select_", ""));
        userTargetGroup[userId] = chatId;

        bot.editMessageText(
            `✅ Target group set:\n${userGroups[userId][chatId]}`,
            {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            }
        );
    }

    bot.answerCallbackQuery(query.id);
});

console.log("🤖 Bot running...");
