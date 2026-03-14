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

    const normalizeExtras = (extras) => {
      if (!Array.isArray(extras)) return [];
      return extras
        .map((extra) => {
          if (typeof extra === "string") return extra.trim();
          if (extra && typeof extra.name === "string") return extra.name.trim();
          return "";
        })
        .filter(Boolean);
    };

    const finalItems = items.length
      ? items.map((i) => ({
          qty: Number.parseInt(i.qty, 10) || 1,
          name: i.name,
          extras: normalizeExtras(i.extras),
        }))
      : fallbackItems;

    const name = typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : (isTablePayment ? `Tavolo ${tableNumber ?? "-"}` : "Cliente non indicato");
    const phone = typeof data.phone === "string" && data.phone.trim() ? data.phone.trim() : "-";
    const address = typeof data.address === "string" && data.address.trim()
      ? data.address.trim()
      : (isTablePayment ? `Tavolo ${tableNumber ?? "-"}` : "-");
    const notes = typeof data.notes === "string" && data.notes.trim() ? data.notes.trim() : "-";

    const rawOrderType = typeof data.orderType === "string" ? data.orderType.trim() : "";
    const legacyMode = typeof data.mode === "string" ? data.mode.trim() : "";
    const normalizedOrderType = rawOrderType || (legacyMode === "ritiro" ? "ritiro_in_pizzeria" : "asporto");
    const orderTypeLabel = normalizedOrderType === "ritiro_in_pizzeria" ? "Ritiro in pizzeria" : "Asporto";
    const pickupTime = typeof data.pickupTime === "string" && data.pickupTime.trim()
      ? data.pickupTime.trim()
      : (typeof data.time === "string" && data.time.trim() ? data.time.trim() : "-");

    const tableLine = isTablePayment ? `\n🪑 *Tavolo:* ${tableNumber ?? "-"}` : "";
    const statusLine = data.status ? `\n📌 *Stato:* ${String(data.status)}` : "";
    const orderIdLine = data.orderId ? `\n🧾 *ID:* ${String(data.orderId)}` : "";
    const orderTypeLine = !isTablePayment ? `\n🛍️ *Tipo ordine:* ${orderTypeLabel}` : "";
    const pickupTimeLine = !isTablePayment ? `\n⏰ *Ora ritiro:* ${pickupTime}` : "";
    const notesLine = !isTablePayment ? `\n📝 *Note:* ${notes}` : "";

    const message = `
📦 *Nuovo ordine AL DOGE!*

👤 *Nome:* ${name}
📞 *Telefono:* ${phone}
📍 *Indirizzo:* ${address}${orderTypeLine}${pickupTimeLine}${notesLine}${tableLine}${statusLine}${orderIdLine}

🧾 *Ordine:*
${finalItems.map((i) => {
      const baseLine = `- ${i.qty}× ${i.name}`;
      if (!Array.isArray(i.extras) || !i.extras.length) {
        return baseLine;
      }
      const extrasLines = i.extras.map((extra) => `  + ${extra}`).join("\n");
      return `${baseLine}\n${extrasLines}`;
    }).join("\n")}

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
