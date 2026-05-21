const fetch = require("node-fetch");

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    let data;
    try {
      data = JSON.parse(event.body || "{}");
    } catch (error) {
      return { statusCode: 400, body: "Invalid JSON payload" };
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return { statusCode: 500, body: "Missing Telegram credentials" };
    }

    const clean = (value) => (typeof value === "string" ? value.trim() : "");

    const name = clean(data.name);
    const phone = clean(data.phone);
    const date = clean(data.date);
    const time = clean(data.time);
    const people = Number.parseInt(data.people, 10);
    const zone = clean(data.zone) || "Indifferente";
    const notes = clean(data.notes) || "-";

    if (!name || !phone || !date || !time || !Number.isFinite(people) || people < 1) {
      return { statusCode: 400, body: "Missing required booking fields" };
    }

    const message = `
📌 *Nuova richiesta prenotazione AL DOGE*

👤 *Nome:* ${name}
📞 *Telefono:* ${phone}
📅 *Data:* ${date}
⏰ *Ora:* ${time}
👥 *Persone:* ${people}
📍 *Zona preferita:* ${zone}
📝 *Note:* ${notes}

⚠️ *Da confermare al cliente.*
La zona indicata è una preferenza e può variare in base alla disponibilità.
    `;

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
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
      console.error("Telegram booking error:", result);
      return { statusCode: 500, body: "Telegram API error" };
    }

    return { statusCode: 200, body: "Booking request sent" };
  } catch (error) {
    console.error("Booking function error:", error);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};
