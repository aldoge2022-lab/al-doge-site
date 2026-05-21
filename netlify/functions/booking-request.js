const fetch = require("node-fetch");

const clean = (value) => (typeof value === "string" ? value.trim() : "");

function normalizeItalianPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("39")) return digits;
  return `39${digits}`;
}

function whatsappUrl(phone, text) {
  const normalizedPhone = normalizeItalianPhone(phone);
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(text)}`;
}

async function saveBooking(data) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/submit_booking_request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      p_full_name: data.name,
      p_phone: data.phone,
      p_booking_date: data.date,
      p_booking_time: data.time,
      p_people: data.people,
      p_preferred_zone: data.zone,
      p_notes: data.notes === "-" ? null : data.notes,
      p_contact_consent: data.contactConsent === true,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `Supabase RPC error ${response.status}`);
  }

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text || null;
  }
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
      const savedBookingId = await saveBooking({ name, phone, date, time, people, zone, notes, contactConsent });
      if (savedBookingId) {
        databaseStatus = "salvato";
        bookingId = String(savedBookingId).replace(/^"|"$/g, "");
      }
    } catch (dbError) {
      console.error("Booking database error:", dbError);
      databaseStatus = "errore salvataggio";
    }

    const confirmText = `Ciao ${name}, ti confermiamo la prenotazione da AL DOGE per il ${date} alle ${time} per ${people} persone. A presto.`;
    const proposeText = `Ciao ${name}, per l'orario richiesto non abbiamo disponibilità. Possiamo proporti un altro orario. Ti va bene se ci sentiamo per confermare?`;
    const unavailableText = `Ciao ${name}, ci dispiace ma per il ${date} alle ${time} non abbiamo disponibilità. Puoi chiamarci al 0432 1840683 per trovare un'altra soluzione.`;

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
Usa i pulsanti qui sotto per aprire WhatsApp con il messaggio già pronto.
    `;

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Conferma su WhatsApp", url: whatsappUrl(phone, confirmText) }],
            [{ text: "🕒 Proponi altro orario", url: whatsappUrl(phone, proposeText) }],
            [{ text: "❌ Non disponibile", url: whatsappUrl(phone, unavailableText) }]
          ]
        }
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
