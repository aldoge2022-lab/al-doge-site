const fetch = require("node-fetch");

exports.handler = async function (event, context) {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: "Method Not Allowed",
      };
    }

    let data;
    try {
      data = JSON.parse(event.body || "{}");
    } catch (parseError) {
      return {
        statusCode: 400,
        body: "Invalid JSON payload",
      };
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return {
        statusCode: 500,
        body: "Missing Telegram credentials",
      };
    }

    const isTablePayment = data.type === "table_payment" || Number.isFinite(Number(data.tableNumber));
    const tableNumber = Number.isFinite(Number(data.tableNumber)) ? Number(data.tableNumber) : null;

    const totalAmount = Number.parseFloat(data.total);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return {
        statusCode: 400,
        body: "Invalid total amount",
      };
    }

    const items = Array.isArray(data.items)
      ? data.items.filter((item) => item && typeof item.name === "string")
      : [];

    const fallbackItems = isTablePayment
      ? [{ qty: 1, name: `Pagamento tavolo ${tableNumber ?? "-"}` }]
      : [];

    const finalItems = items.length
      ? items.map((i) => ({ qty: Number.parseInt(i.qty, 10) || 1, name: i.name }))
      : fallbackItems;

    const name = typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : (isTablePayment ? `Tavolo ${tableNumber ?? "-"}` : "Cliente non indicato");
    const phone = typeof data.phone === "string" && data.phone.trim() ? data.phone.trim() : "-";
    const address = typeof data.address === "string" && data.address.trim()
      ? data.address.trim()
      : (isTablePayment ? `Tavolo ${tableNumber ?? "-"}` : "-");

    const tableLine = isTablePayment ? `\n🪑 *Tavolo:* ${tableNumber ?? "-"}` : "";
    const statusLine = data.status ? `\n📌 *Stato:* ${String(data.status)}` : "";
    const orderIdLine = data.orderId ? `\n🧾 *ID:* ${String(data.orderId)}` : "";

    const message = `
📦 *Nuovo ordine AL DOGE!*

👤 *Nome:* ${name}
📞 *Telefono:* ${phone}
📍 *Indirizzo:* ${address}${tableLine}${statusLine}${orderIdLine}

🧾 *Ordine:*
${finalItems.map((i) => `- ${i.qty}× ${i.name}`).join("\n")}

💶 *Totale:* €${totalAmount.toFixed(2)}
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
