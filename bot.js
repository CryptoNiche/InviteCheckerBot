const TelegramBot = require("node-telegram-bot-api");

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
    console.error("❌ BOT_TOKEN not set");
    process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

/**
 * userGroups:
 * {
 *   userId: {
 *     chatId: chatTitle
 *   }
 * }
 */
const userGroups = {};

/**
 * selected broadcast target per user
 * userId -> chatId | null
 */
const broadcastTarget = {};

// ─────────────────────────────────────────────
// AUTO-DETECT GROUPS (NO ADMIN REQUIRED)
// ─────────────────────────────────────────────
bot.on("message", (msg) => {
    const chat = msg.chat;
    const userId = msg.from?.id;
    if (!userId) return;

    if (chat.type === "group" || chat.type === "supergroup") {
        if (!userGroups[userId]) userGroups[userId] = {};
        userGroups[userId][chat.id] = chat.title || "Unnamed Group";

        console.log(
            `📡 Group detected for user ${userId}:`,
            chat.title,
            chat.id
        );
    }
});

// ─────────────────────────────────────────────
// /start → ALWAYS SHOW INLINE BUTTONS
// ─────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (msg.chat.type !== "private") return;

    const groups = userGroups[userId] || {};

    const keyboard = [];

    // add detected groups (if any)
    for (const [id, title] of Object.entries(groups)) {
        keyboard.push([
            { text: title, callback_data: `broadcast_${id}` }
        ]);
    }

    // ALWAYS show Skip
    keyboard.push([
        { text: "⏭ Skip Broadcast", callback_data: "broadcast_skip" }
    ]);

    bot.sendMessage(chatId, "📣 Where should this be broadcast?", {
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
});

// ─────────────────────────────────────────────
// INLINE BUTTON HANDLER
// ─────────────────────────────────────────────
bot.on("callback_query", (query) => {
    const userId = query.from.id;
    const chatId = query.message.chat.id;
    const data = query.data;

    // Skip
    if (data === "broadcast_skip") {
        broadcastTarget[userId] = null;

        bot.editMessageText("⏭ Broadcast skipped.", {
            chat_id: chatId,
            message_id: query.message.message_id
        });

        bot.answerCallbackQuery(query.id);
        return;
    }

    // Select group
    if (data.startsWith("broadcast_")) {
        const groupId = data.replace("broadcast_", "");
        broadcastTarget[userId] = groupId;

        const groupName =
            userGroups[userId]?.[groupId] || "Unknown Group";

        bot.editMessageText(
            `✅ Broadcasting to:\n<b>${groupName}</b>`,
            {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: "HTML"
            }
        );

        bot.answerCallbackQuery(query.id);
        return;
    }
});

console.log("🤖 Bot is running...");
