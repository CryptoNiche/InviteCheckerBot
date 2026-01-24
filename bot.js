const TelegramBot = require("node-telegram-bot-api");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

// ================= CONFIG =================
const BOT_TOKEN = process.env.BOT_TOKEN;
const SHEET_ID = process.env.SHEET_ID;
const PREFIX = "goodluck";

// 🔐 OWNER LOCK
const OWNER_ID = 933749968;

// persistence file
const ENABLED_FILE = path.join(__dirname, "enabled_groups.json");

// ================= TELEGRAM =================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ================= LOAD ENABLED GROUPS =================
let enabledChats = new Set();

function loadEnabledChats() {
  try {
    if (fs.existsSync(ENABLED_FILE)) {
      const data = JSON.parse(fs.readFileSync(ENABLED_FILE));
      enabledChats = new Set(data);
      console.log("✅ Loaded enabled groups:", [...enabledChats]);
    }
  } catch (err) {
    console.error("Failed to load enabled groups:", err.message);
  }
}

function saveEnabledChats() {
  try {
    fs.writeFileSync(ENABLED_FILE, JSON.stringify([...enabledChats]));
  } catch (err) {
    console.error("Failed to save enabled groups:", err.message);
  }
}

loadEnabledChats();

// ================= GOOGLE SHEETS =================
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// ================= SHEET HELPERS =================
function sanitizeSheetName(name) {
  return name.replace(/[\\\/\?\*\[\]]/g, "").substring(0, 90);
}

async function ensureSheetExists(sheetName) {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
  });

  const exists = spreadsheet.data.sheets.some(
    (s) => s.properties.title === sheetName
  );

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: sheetName },
            },
          },
        ],
      },
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A:F`,
      valueInputOption: "RAW",
      requestBody: {
        values: [["Timestamp", "Name", "Username", "Message", "Chat Title", "Chat ID"]],
      },
    });

    console.log(`📄 Created sheet: ${sheetName}`);
  }
}

async function logToSheet(sheetName, row) {
  await ensureSheetExists(sheetName);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:F`,
    valueInputOption: "RAW",
    requestBody: {
      values: [row],
    },
  });
}

// ================= OWNER CHECK =================
function isOwner(userId) {
  return userId === OWNER_ID;
}

// ================= BOT COMMANDS =================

// Start command
bot.onText(/^\/start(@\w+)?$/, (msg) => {
  bot.sendMessage(msg.chat.id, "Control panel (owner only):", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Enable Tracking", callback_data: "enable_tracking" },
          { text: "❌ Disable Tracking", callback_data: "disable_tracking" },
        ],
      ],
    },
  });
});

// Auto-enable when YOU add the bot to a group
bot.on("new_chat_members", (msg) => {
  const botAdded = msg.new_chat_members.some(
    (m) => m.username === bot.me.username
  );

  if (!botAdded) return;

  if (msg.from.id !== OWNER_ID) {
    bot.sendMessage(
      msg.chat.id,
      "⛔ This bot is private and can only be configured by the owner."
    );
    return;
  }

  enabledChats.add(msg.chat.id);
  saveEnabledChats();

  bot.sendMessage(
    msg.chat.id,
    "🟢 Bot added by owner. Tracking automatically enabled."
  );
});

// Button click handler (OWNER ONLY)
bot.on("callback_query", async (query) => {
  const chat = query.message.chat;
  const userId = query.from.id;

  if (!["enable_tracking", "disable_tracking"].includes(query.data)) return;

  if (!isOwner(userId)) {
    bot.answerCallbackQuery(query.id, {
      text: "⛔ You are not authorized to control this bot.",
      show_alert: true,
    });
    return;
  }

  if (chat.type === "private") {
    bot.answerCallbackQuery(query.id, {
      text: "⚠️ Please use this inside a group.",
      show_alert: true,
    });
    return;
  }

  // ENABLE
  if (query.data === "enable_tracking") {
    enabledChats.add(chat.id);
    saveEnabledChats();

    bot.answerCallbackQuery(query.id, {
      text: `✅ Tracking enabled for: ${chat.title}`,
      show_alert: true,
    });

    bot.sendMessage(chat.id, `🟢 Tracking enabled in "${chat.title}"`);
  }

  // DISABLE
  if (query.data === "disable_tracking") {
    enabledChats.delete(chat.id);
    saveEnabledChats();

    bot.answerCallbackQuery(query.id, {
      text: `❌ Tracking disabled for: ${chat.title}`,
      show_alert: true,
    });

    bot.sendMessage(chat.id, `🔴 Tracking disabled in "${chat.title}"`);
  }
});

// ================= MESSAGE LISTENER =================
bot.on("message", async (msg) => {
  if (!msg.text) return;
  if (!enabledChats.has(msg.chat.id)) return;

  const text = msg.text.trim().toLowerCase();
  if (!text.startsWith(PREFIX)) return;

  const name = `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim();
  const username = msg.from.username ? `@${msg.from.username}` : "N/A";
  const message = msg.text;
  const chatTitle = msg.chat.title || "Private Chat";
  const chatId = msg.chat.id;
  const time = new Date().toLocaleString();

  const sheetName = sanitizeSheetName(chatTitle || `chat_${chatId}`);
  const row = [time, name, username, message, chatTitle, chatId];

  try {
    await logToSheet(sheetName, row);
    console.log("Saved to", sheetName, row);
  } catch (err) {
    console.error("Google Sheet Error:", err.message);
  }
});

console.log("🤖 Bot is running...");
