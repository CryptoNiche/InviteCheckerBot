const TelegramBot = require("node-telegram-bot-api");
const { google } = require("googleapis");

// ================= CONFIG =================
const BOT_TOKEN = process.env.BOT_TOKEN;
const SHEET_ID = process.env.SHEET_ID;
const PREFIXES = ["goodluck", "#GTFuturesPnL", "#GTfuturespnl", "Thanks for inviting me", "#quiz123", "#Dj123", "D. 1g #GateTradFiMetals" ,"B. Safe-haven #GateTradFiMetals", "A. Gold (XAU), Silver (XAG), Platinum (XPT), Copper (XCU) #GateTradFiMetals"];

// 🔐 OWNER LOCK
const OWNER_ID = [933749968, 8179916179];

// system sheet name
const ENABLED_SHEET = "__enabled_groups__";

// ================= BATCH QUEUE =================
const messageQueue = [];
const BATCH_INTERVAL = 20000; // 20 seconds

// ================= TELEGRAM =================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ================= GOOGLE SHEETS =================
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// ================= ENABLED GROUP STORAGE =================
let enabledChats = new Set();

async function ensureEnabledSheet() {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
  });

  const exists = spreadsheet.data.sheets.some(
    (s) => s.properties.title === ENABLED_SHEET
  );

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: ENABLED_SHEET } } }],
      },
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${ENABLED_SHEET}!A:B`,
      valueInputOption: "RAW",
      requestBody: {
        values: [["chat_id", "chat_title"]],
      },
    });

    console.log("📄 Created enabled groups sheet");
  }
}

async function loadEnabledChats() {
  try {
    await ensureEnabledSheet();

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${ENABLED_SHEET}!A2:A`,
    });

    const rows = res.data.values || [];
    enabledChats = new Set(rows.map((r) => Number(r[0])));

    console.log("✅ Loaded enabled groups:", [...enabledChats]);
  } catch (err) {
    console.error("Failed loading enabled groups:", err.message);
  }
}

async function addEnabledChat(chatId, title) {
  await ensureEnabledSheet();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${ENABLED_SHEET}!A:B`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[chatId, title]],
    },
  });

  enabledChats.add(chatId);
}

async function removeEnabledChat(chatId) {
  await ensureEnabledSheet();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${ENABLED_SHEET}!A2:B`,
  });

  const rows = res.data.values || [];
  const filtered = rows.filter((r) => Number(r[0]) !== chatId);

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${ENABLED_SHEET}!A2:B`,
  });

  if (filtered.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${ENABLED_SHEET}!A2:B`,
      valueInputOption: "RAW",
      requestBody: { values: filtered },
    });
  }

  enabledChats.delete(chatId);
}

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
        requests: [{ addSheet: { properties: { title: sheetName } } }],
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

// ================= BATCH WRITER =================
async function processBatch() {
  if (messageQueue.length === 0) return;

  // Group messages by sheet name
  const grouped = {};
  
  while (messageQueue.length > 0) {
    const item = messageQueue.shift();
    if (!grouped[item.sheetName]) {
      grouped[item.sheetName] = [];
    }
    grouped[item.sheetName].push(item.row);
  }

  // Write all groups
  for (const [sheetName, rows] of Object.entries(grouped)) {
    try {
      await ensureSheetExists(sheetName);
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!A:F`,
        valueInputOption: "RAW",
        requestBody: {
          values: rows,
        },
      });
      console.log(`✅ Batch saved ${rows.length} messages to ${sheetName}`);
    } catch (err) {
      console.error(`❌ Batch error for ${sheetName}:`, err.message);
    }
  }
}

// Start batch processor
setInterval(processBatch, BATCH_INTERVAL);

// ================= OWNER CHECK =================
function isOwner(userId) {
  return OWNER_ID.includes(userId);
}

// ================= BOT COMMANDS =================

// Start command - FIXED: Only responds to /start@NexDeskCheckerBot
bot.onText(/^\/start@(\w+)$/, async (msg, match) => {
  const mentionedBot = match[1]; // Get the username from the regex capture group
  const botInfo = await bot.getMe();
  
  // Only respond if the mentioned username matches this bot
  if (mentionedBot.toLowerCase() === botInfo.username.toLowerCase()) {
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
  }
  // If username doesn't match, do nothing (command is for another bot)
});

// Load enabled groups on startup
loadEnabledChats();

// Button click handler
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
    if (!enabledChats.has(chat.id)) {
      await addEnabledChat(chat.id, chat.title);
    }

    bot.answerCallbackQuery(query.id, {
      text: `✅ Tracking enabled for: ${chat.title}`,
      show_alert: true,
    });

    bot.sendMessage(chat.id, `🟢 Tracking enabled in "${chat.title}"`);
  }

  // DISABLE
  if (query.data === "disable_tracking") {
    if (enabledChats.has(chat.id)) {
      await removeEnabledChat(chat.id);
    }

    bot.answerCallbackQuery(query.id, {
      text: `❌ Tracking disabled for: ${chat.title}`,
      show_alert: true,
    });

    bot.sendMessage(chat.id, `🔴 Tracking disabled in "${chat.title}"`);
  }
});

// ================= MESSAGE LISTENER =================
bot.on("message", async (msg) => {
  // ✅ Check BOTH text and caption
  const messageText = msg.text || msg.caption;
  
  if (!messageText) return;
  if (!enabledChats.has(msg.chat.id)) return;

  const text = messageText.toLowerCase();

  const matched = PREFIXES.some(prefix => {
    return text.includes(prefix.toLowerCase());
  });

  if (!matched) return;

  const name = `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim();
  const username = msg.from.username ? `@${msg.from.username}` : "N/A";
  const message = messageText;
  const chatTitle = msg.chat.title || "Private Chat";
  const chatId = msg.chat.id;
  const time = new Date().toLocaleString();

  const sheetName = sanitizeSheetName(chatTitle || `chat_${chatId}`);
  const row = [time, name, username, message, chatTitle, chatId];

  // Add to queue instead of writing immediately
  messageQueue.push({ sheetName, row });
  console.log(`📝 Queued message (${messageQueue.length} in queue)`);
});

console.log("🤖 Bot is running with 20-second batch processing...");
