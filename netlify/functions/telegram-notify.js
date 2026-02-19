exports.handler = async (event) => {
  try {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID"
        })
      };
    }

    const body = JSON.parse(event.body || "{}");

    const messaggio = `
🍕 NUOVO ORDINE AL DOGE

👤 Nome: ${body.nome || "Non specificato"}
📞 Telefono: ${body.telefono || "Non specificato"}
🕒 Orario ritiro: ${body.orario || "Non specificato"}

🧾 Ordine:
${body.ordine || "Nessun dettaglio"}

💰 Totale: €${body.totale || "0"}
    `;

    const telegramURL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    const response = await fetch(telegramURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: messaggio
      })
    });

    const data = await response.json();

    if (!data.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Telegram API error",
          telegramResponse: data
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Server error",
        details: error.message
      })
    };
  }
};
