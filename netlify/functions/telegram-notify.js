const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

function cents(value) {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function normalizeExtras(extras) {
  if (!Array.isArray(extras)) return [];
  return extras
    .map((extra) => {
      if (typeof extra === "string") return extra.trim();
      if (extra && typeof extra.name === "string") return extra.name.trim();
      return "";
    })
    .filter(Boolean);
}

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    let data;
    try {
      data = JSON.parse(event.body || "{}");
    } catch (_) {
      return { statusCode: 400, body: "Invalid JSON payload" };
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!botToken || !chatId) {
      return { statusCode: 500, body: "Missing Telegram credentials" };
    }

    const isTablePayment = data.type === "table_payment" || Number.isFinite(Number(data.tableNumber));
    const tableNumber = Number.isFinite(Number(data.tableNumber)) ? Number(data.tableNumber) : null;
    const totalAmount = Number.parseFloat(data.total);

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return { statusCode: 400, body: "Invalid total amount" };
    }

    const items = Array.isArray(data.items)
      ? data.items.filter((item) => item && typeof item.name === "string")
      : [];

    const fallbackItems = isTablePayment
      ? [{ qty: 1, name: `Pagamento tavolo ${tableNumber ?? "-"}`, extras: [] }]
      : [];

    const finalItems = items.length
      ? items.map((i) => ({
          qty: Number.parseInt(i.qty, 10) || 1,
          name: i.name,
          extras: normalizeExtras(i.extras),
          notes: typeof i.notes === "string" ? i.notes.trim() : "",
          price: Number.parseFloat(i.price || i.unitPrice || 0) || 0,
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
    const dbOrderType = isTablePayment ? "tavolo" : (normalizedOrderType === "ritiro_in_pizzeria" ? "ritiro_pizzeria" : "asporto");
    const pickupTime = typeof data.pickupTime === "string" && data.pickupTime.trim()
      ? data.pickupTime.trim()
      : (typeof data.time === "string" && data.time.trim() ? data.time.trim() : "-");

    let savedOrder = null;
    let printJob = null;

    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      let customer = null;
      if (phone && phone !== "-") {
        const { data: customerRows, error: customerError } = await supabase
          .from("customers")
          .upsert({
            full_name: name,
            phone,
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "phone" })
          .select("id,full_name,phone")
          .limit(1);
        if (customerError) console.error("Customer save error:", customerError);
        customer = Array.isArray(customerRows) ? customerRows[0] : null;
      }

      const totalCents = cents(totalAmount);
      const { data: orderRows, error: orderError } = await supabase
        .from("sales_orders")
        .insert({
          source: isTablePayment ? "qr_table" : "site",
          order_type: dbOrderType,
          status: "confirmed",
          payment_status: isTablePayment ? "paid" : "unpaid",
          print_status: "pending",
          customer_id: customer?.id || null,
          customer_name: name,
          customer_phone: phone,
          table_number: tableNumber,
          pickup_time: pickupTime,
          subtotal_cents: totalCents,
          total_cents: totalCents,
          notes,
          raw_payload: data,
        })
        .select("*")
        .limit(1);

      if (orderError) {
        console.error("Order save error:", orderError);
      } else {
        savedOrder = Array.isArray(orderRows) ? orderRows[0] : null;
      }

      if (savedOrder) {
        for (let index = 0; index < finalItems.length; index += 1) {
          const item = finalItems[index];
          const qty = item.qty || 1;
          const unitCents = cents(item.price || 0);
          const lineCents = unitCents > 0 ? unitCents * qty : 0;
          const { data: itemRows, error: itemError } = await supabase
            .from("sales_order_items")
            .insert({
              sales_order_id: savedOrder.id,
              line_number: index + 1,
              product_type: "pizza",
              product_name: item.name,
              category: "Ordini sito",
              quantity: qty,
              unit_price_cents: unitCents,
              line_total_cents: lineCents,
              notes: item.notes || null,
              raw_payload: item,
            })
            .select("id")
            .limit(1);

          if (itemError) {
            console.error("Order item save error:", itemError);
            continue;
          }

          const savedItem = Array.isArray(itemRows) ? itemRows[0] : null;
          if (savedItem && item.extras.length) {
            await supabase.from("sales_order_item_ingredients").insert(
              item.extras.map((extra) => ({
                sales_order_item_id: savedItem.id,
                ingredient_name: extra,
                action: "add",
                quantity: 1,
                unit_price_cents: 0,
                total_price_cents: 0,
                ingredient_category: "extra",
              }))
            );
          }
        }

        await supabase.from("sales_payments").insert({
          sales_order_id: savedOrder.id,
          payment_method: isTablePayment ? "stripe" : "contanti_ritiro",
          status: isTablePayment ? "paid" : "pending",
          amount_cents: totalCents,
        });

        await supabase.from("accounting_events").insert({
          source_type: "sales_order",
          source_id: savedOrder.id,
          event_type: "order_confirmed",
          sales_order_id: savedOrder.id,
          customer_id: customer?.id || null,
          customer_name: name,
          customer_phone: phone,
          table_number: tableNumber,
          payment_method: isTablePayment ? "stripe" : "contanti_ritiro",
          total_cents: totalCents,
          paid_cents: isTablePayment ? totalCents : 0,
          item_summary: finalItems,
          raw_payload: data,
        });

        const { data: printRows, error: printError } = await supabase
          .from("print_jobs")
          .insert({
            source_type: isTablePayment ? "table_payment" : "order",
            source_id: savedOrder.id,
            printer_name: "EPSON BAR",
            status: "pending",
            payload: {
              title: "COMANDA PIZZERIA",
              order_number: savedOrder.order_number,
              order_type: dbOrderType,
              pickup_time: pickupTime,
              customer_name: name,
              customer_phone: phone,
              table_number: tableNumber,
              notes,
              items: finalItems.map((item) => ({
                qty: item.qty,
                name: item.name,
                notes: item.notes,
                additions: item.extras,
              })),
            },
          })
          .select("id,status")
          .limit(1);

        if (printError) console.error("Print job save error:", printError);
        printJob = Array.isArray(printRows) ? printRows[0] : null;
      }
    } else {
      console.warn("Supabase credentials missing: order was only sent to Telegram.");
    }

    const tableLine = isTablePayment ? `\n🪑 *Tavolo:* ${tableNumber ?? "-"}` : "";
    const statusLine = data.status ? `\n📌 *Stato:* ${String(data.status)}` : "";
    const orderIdLine = savedOrder?.id ? `\n🧾 *ID:* ${String(savedOrder.id)}` : (data.orderId ? `\n🧾 *ID:* ${String(data.orderId)}` : "");
    const orderTypeLine = !isTablePayment ? `\n🛍️ *Tipo ordine:* ${orderTypeLabel}` : "";
    const pickupTimeLine = !isTablePayment ? `\n⏰ *Ora ritiro:* ${pickupTime}` : "";
    const notesLine = !isTablePayment ? `\n📝 *Note:* ${notes}` : "";
    const printLine = printJob?.id ? `\n🖨️ *Stampa:* in coda` : "";

    const message = `
📦 *Nuovo ordine AL DOGE!*

👤 *Nome:* ${name}
📞 *Telefono:* ${phone}
📍 *Indirizzo:* ${address}${orderTypeLine}${pickupTimeLine}${notesLine}${tableLine}${statusLine}${orderIdLine}${printLine}

🧾 *Ordine:*
${finalItems.map((i) => {
      const baseLine = `- ${i.qty}× ${i.name}`;
      if (!Array.isArray(i.extras) || !i.extras.length) return baseLine;
      const extrasLines = i.extras.map((extra) => `  + ${extra}`).join("\n");
      return `${baseLine}\n${extrasLines}`;
    }).join("\n")}

💶 *Totale:* €${totalAmount.toFixed(2)}
    `;

    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "Markdown" }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error("Telegram error:", result);
      return { statusCode: 500, body: "Telegram API error" };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, telegram: true, orderId: savedOrder?.id || null, printJobId: printJob?.id || null }),
    };
  } catch (err) {
    console.error("Function error:", err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};
