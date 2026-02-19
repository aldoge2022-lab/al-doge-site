const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {

    const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!event.body) {
      return {
        statusCode: 400,
        body: "No body received"
      };
    }

    const data = JSON.parse(event.body);

    const message = `
🆕 Nuovo Ordine AL DOGE

👤 Nome: ${data.nome || "-"}
📞 Telefono: ${data.telefono || "-"}
🕒 Ritiro: ${data.orario || "-"}
💰 Totale: €${data.totale || "-"}
    `;

    const telegramURL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

    const telegramRes = await fetch(telegramURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message
      })
    });

    const telegramData = await telegramRes.json();

    if (!telegramData.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify(telegramData)
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: error.message
    };
  }
};
