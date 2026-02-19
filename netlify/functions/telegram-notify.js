const fetch = require("node-fetch");

exports.handler = async function (event, context) {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: "Method Not Allowed",
      };
    }

    const data = JSON.parse(event.body);

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return {
        statusCode: 500,
        body: "Missing Telegram credentials",
      };
    }

    const message = `
📦 *Nuovo ordine AL DOGE!*

👤 *Nome:* ${data.name}
📞 *Telefono:* ${data.phone}
📍 *Indirizzo:* ${data.address}

🧾 *Ordine:*
${data.items.map((i) => `- ${i.qty}× ${i.name}`).join("\n")}

💶 *Totale:* €${data.total}
    `;

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

    if (!response.ok) {
      console.error("Telegram error:", result);
      return {
        statusCode: 500,
        body: "Telegram API error",
      };
    }

    return {
      statusCode: 200,
      body: "Order sent to Telegram",
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      body: "Internal Server Error",
    };
  }
};
