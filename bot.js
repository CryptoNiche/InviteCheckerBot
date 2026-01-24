const TelegramBot = require("node-telegram-bot-api");
const { google } = require("googleapis");
const path = require("path");

// ================= CONFIG =================
const BOT_TOKEN = "PUT_YOUR_BOT_TOKEN_HERE";
const SHEET_ID = "PUT_YOUR_SHEET_ID_HERE";
const PREFIX = "goodluck";

// ================= TELEGRAM =================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// store enabled chats
const enabledChats = new Set();

// ================= GOOGLE SHEETS =================
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, "credentials.json"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// ================= FUNCTIONS =================
async function logToSheet(row) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Sheet1!A:F",
    valueInputOption: "RAW",
    requestBody: {
      values: [row],
    },
  });
}

// ================= BOT COMMANDS =================

// Start command
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Welcome! Click the button below inside a group to enable tracking.", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Enable Tracking", callback_data: "enable_tracking" }]
      ]
    }
  });
});

// Button click handler
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;

  if (query.data === "enable_tracking") {
    enabledChats.add(chatId);

    bot.answerCallbackQuery(query.id, {
      text: "Tracking enabled for this chat!",
      show_alert: true
    });

    bot.sendMessage(chatId, "🟢 Tracking is now active in this chat.\nMessages starting with 'goodluck' will be logged.");
  }
});

// Listen to all messages
bot.on("message", async (msg) => {
  if (!msg.text) return;
  if (!enabledChats.has(msg.chat.id)) return;

  const text = msg.text.toLowerCase();
  if (!text.startsWith(PREFIX)) return;

  const name = `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim();
  const username = msg.from.username ? `@${msg.from.username}` : "N/A";
  const message = msg.text;
  const chatTitle = msg.chat.title || "Private Chat";
  const chatId = msg.chat.id;
  const time = new Date().toLocaleString();

  const row = [time, name, username, message, chatTitle, chatId];

  try {
    await logToSheet(row);
    console.log("Saved:", row);
  } catch (err) {
    console.error("Google Sheet Error:", err.message);
  }
});

console.log("🤖 Bot is running...");
