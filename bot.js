const TelegramBot = require("node-telegram-bot-api");

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
    console.error("❌ BOT_TOKEN not set!");
    process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

/**
 * SAME STRUCTURE AS YOUR WORKING BOT
 * userId -> { chatId: groupTitle }
 */
const broadcastGroups = {};

/**
 * userId -> selected groupId | null
 */
const broadcastTargets = {};

// ─────────────────────────────────────────────
// ✅ AUTO REGISTER GROUPS (EXACT SAME AS WORKING BOT)
// ─────────────────────────────────────────────
bot.on("message", (msg) => {
    const chat = msg.chat;
    const userId = msg.from?.id;
    if (!userId) return;

    if (chat.type === "group" || chat.type === "supergroup") {
        if (!broadcastGroups[userId]) {
            broadcastGroups[userId] = {};
        }

        broadcastGroups[userId][chat.id] =
            chat.title || "Unnamed Group";

        console.log(
            "📡 Registered group for user",
            userId,
            ":",
            chat.title,
            chat.id
        );
    }
});

// ─────────────────────────────────────────────
// /start → ALWAYS SHOW INLINE MENU (EVEN IF EMPTY)
// ─────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (msg.chat.type !== "private") return;

    const myGroups = broadcastGroups[userId] || {};
    const keyboard = [];

    // detected groups
    for (const [id, name] of Object.entries(myGroups)) {
        keyboard.push([
            { text: name, callback_data: `broadcast_${id}` }
        ]);
    }

    // ALWAYS add skip
    keyboard.push([
        { text: "⏭ Skip Broadcast", callback_data: "broadcast_skip" }
    ]);

    await bot.sendMessage(chatId, "📣 Where should this be broadcast?", {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// ─────────────────────────────────────────────
// INLINE BUTTON HANDLER
// ─────────────────────────────────────────────
bot.on("callback_query", async (query) => {
    const userId = query.from.id;
    const chatId = query.message.chat.id;
    const data = query.data;

    // Skip
    if (data === "broadcast_skip") {
        broadcastTargets[userId] = null;

        await bot.editMessageText(
            "⏭ Broadcast skipped.",
            {
                chat_id: chatId,
                message_id: query.message.message_id
            }
        );

        bot.answerCallbackQuery(query.id);
        return;
    }

    // Select group
    if (data.startsWith("broadcast_")) {
        const groupId = data.replace("broadcast_", "");
        broadcastTargets[userId] = groupId;

        const groupName =
            broadcastGroups[userId]?.[groupId] || "Unknown Group";

        await bot.editMessageText(
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

console.log("🤖 Bot is running…");
