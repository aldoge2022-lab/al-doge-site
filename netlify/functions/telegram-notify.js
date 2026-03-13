const fetch = require("node-fetch");

exports.handler = async function (event, context) {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: "Method Not Allowed",
      };
    }

    if (!event.body) {
      return {
        statusCode: 400,
        body: "Missing request body",
      };
    }

    let data;
    try {
      data = JSON.parse(event.body);
    } catch (parseError) {
      return {
        statusCode: 400,
        body: "Invalid JSON payload",
      };
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return {
        statusCode: 400,
        body: "Invalid payload format",
      };
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const deployContext = process.env.CONTEXT || "unknown";

    console.log(
      `[telegram-notify] Context=${deployContext} tokenPresent=${Boolean(
        botToken
      )} chatIdPresent=${Boolean(chatId)}`
    );

    if (!botToken || !chatId) {
      return {
        statusCode: 500,
        body: "Missing Telegram credentials",
      };
    }

    const hasItems = Array.isArray(data.items);
    const hasUsefulTablePayload =
      typeof data.tableNumber !== "undefined" ||
      typeof data.total !== "undefined" ||
      typeof data.orderId !== "undefined";

    if (!hasItems && !hasUsefulTablePayload) {
      return {
        statusCode: 400,
        body: "Missing required order data",
      };
    }

    const safeText = (value, fallback = "N/D") => {
      if (value === null || typeof value === "undefined") {
        return fallback;
      }
      const text = String(value).trim();
      return text || fallback;
    };

    let message;

    if (hasItems) {
      console.log("[telegram-notify] Payload type: full-order");

      const itemLines = data.items.length
        ? data.items
            .map((item) => {
              const qty = safeText(item && item.qty, "?");
              const name = safeText(item && item.name, "Articolo");
              return `- ${qty}× ${name}`;
            })
            .join("\n")
        : "- Nessun articolo indicato";

      message = `
📦 *Nuovo ordine AL DOGE!*

👤 *Nome:* ${safeText(data.name)}
📞 *Telefono:* ${safeText(data.phone)}
📍 *Indirizzo:* ${safeText(data.address)}

🧾 *Ordine:*
${itemLines}

💶 *Totale:* €${safeText(data.total, "0")}
      `;
    } else {
      console.log("[telegram-notify] Payload type: simplified-table-qr");

      message = `
💳 *Pagamento tavolo / QR ricevuto*

🪑 *Tavolo:* ${safeText(data.tableNumber)}
🆔 *Order ID:* ${safeText(data.orderId)}
📌 *Tipo:* ${safeText(data.type, "table_payment")}
📋 *Stato:* ${safeText(data.status, "paid")}
🕒 *Timestamp:* ${safeText(data.timestamp)}

💶 *Totale:* €${safeText(data.total, "0")}
      `;
    }

    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const response = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
      }),
    });

    const result = await response.json();

    if (!response.ok || !result || result.ok !== true) {
      console.error("[telegram-notify] Telegram API error", {
        httpStatus: response.status,
        telegramOk: result && result.ok,
        errorCode: result && result.error_code,
        description: result && result.description,
      });
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error: "Telegram API error",
          telegramStatus: response.status,
          telegramDescription:
            (result && result.description) || "Unknown Telegram error",
        }),
      };
    }

    console.log("[telegram-notify] Telegram delivery confirmed", {
      messageId: result.result && result.result.message_id,
      chat: result.result && result.result.chat && result.result.chat.id,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, delivered: true }),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      body: "Internal Server Error",
    };
  }
};
