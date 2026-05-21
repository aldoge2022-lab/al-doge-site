const fetch = require("node-fetch");

const clean = (value) => (typeof value === "string" ? value.trim() : "");

async function supabaseRequest(path, options = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase error ${response.status}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function saveBooking(data) {
  const customerRows = await supabaseRequest("customers?on_conflict=phone", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      phone: data.phone,
      full_name: data.name,
      last_seen_at: new Date().toISOString(),
    }),
  });

  const customer = Array.isArray(customerRows) ? customerRows[0] : null;
  const customerId = customer ? customer.id : null;

  const bookingRows = await supabaseRequest("booking_requests", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      customer_id: customerId,
      full_name: data.name,
      phone: data.phone,
      booking_date: data.date,
      booking_time: data.time,
      people: data.people,
      preferred_zone: data.zone,
      notes: data.notes,
      contact_consent: data.contactConsent === true,
      status: "da_confermare",
      source: "sito_web",
    }),
  });

  if (data.contactConsent === true) {
    await supabaseRequest("customer_consents", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        customer_id: customerId,
        phone: data.phone,
        consent_type: "communications",
        consent_given: true,
        source: "sito_web",
      }),
    });
  }

  return Array.isArray(bookingRows) ? bookingRows[0] : null;
}

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

    const name = clean(data.name);
    const phone = clean(data.phone);
    const date = clean(data.date);
    const time = clean(data.time);
    const people = Number.parseInt(data.people, 10);
    const zone = clean(data.zone) || "Indifferente";
    const notes = clean(data.notes) || "-";
    const contactConsent = data.contactConsent === true;

    if (!name || !phone || !date || !time || !Number.isFinite(people) || people < 1) {
      return { statusCode: 400, body: "Missing required booking fields" };
    }

    let databaseStatus = "non configurato";
    let bookingId = "";

    try {
      const savedBooking = await saveBooking({ name, phone, date, time, people, zone, notes, contactConsent });
      if (savedBooking && savedBooking.id) {
        databaseStatus = "salvato";
        bookingId = savedBooking.id;
      }
    } catch (dbError) {
      console.error("Booking database error:", dbError);
      databaseStatus = "errore salvataggio";
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
📣 *Comunicazioni:* ${contactConsent ? "Sì" : "No"}
🗂️ *Database:* ${databaseStatus}${bookingId ? `\nID: ${bookingId}` : ""}

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
