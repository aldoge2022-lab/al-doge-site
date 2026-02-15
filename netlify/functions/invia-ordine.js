// ===============================
//  INVIO ORDINE A TELEGRAM – NETLIFY FUNCTION
// ===============================

exports.handler = async (event, context) => {
  try {
    const data = JSON.parse(event.body);

    // Validazione base
    if (!data.nome || !data.telefono || !data.carrello || data.carrello.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "Dati mancanti" })
      };
    }

    // Costruzione messaggio Telegram
    let messaggio = `📦 *Nuovo ordine AL DOGE*\n\n`;
    messaggio += `👤 *Cliente:* ${data.nome}\n`;
    messaggio += `📞 *Telefono:* ${data.telefono}\n`;
    if (data.note) messaggio += `📝 *Note:* ${data.note}\n`;
    messaggio += `\n🍽 *Ordine:*\n`;

    data.carrello.forEach(item => {
      messaggio += `• ${item.nome} x${item.quantita} — € ${(item.prezzo * item.quantita).toFixed(2)}\n`;
    });

    messaggio += `\n💰 *Totale:* € ${data.totale.toFixed(2)}`;

    // Invio a Telegram
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: messaggio,
        parse_mode: "Markdown"
      })
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
