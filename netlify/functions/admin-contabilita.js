const fetch = require("node-fetch");

const WEEKDAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

function html(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    body,
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
}

function getAdminPassword() {
  return process.env.ADMIN_DASHBOARD_PASSWORD || process.env.ADMIN_ORDERS_PASSWORD || "";
}

function isAuthorized(event) {
  const expected = getAdminPassword();
  if (!expected) return false;
  const params = event.queryStringParameters || {};
  const provided = params.key || params.password || event.headers["x-admin-password"] || "";
  return provided && provided === expected;
}

function loginPage(reason = "") {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dashboard privata AL DOGE</title><style>body{margin:0;background:#050403;color:#f3ead9;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh}.box{max-width:460px;width:calc(100% - 32px);border:1px solid rgba(210,186,124,.36);background:#11100d;border-radius:22px;padding:24px}h1{color:#d2ba7c;margin:0 0 10px}p{color:#b8ad9b;line-height:1.45}input,button{width:100%;box-sizing:border-box;border-radius:14px;padding:13px;margin-top:10px;font-size:15px}input{background:#080706;border:1px solid rgba(210,186,124,.36);color:#f3ead9}button{background:#b99c62;border:0;color:#080706;font-weight:900}.err{color:#ffb4a8;font-weight:900}</style></head><body><form class="box" method="GET"><h1>Dashboard privata AL DOGE</h1><p>Accesso riservato alla gestione interna.</p>${reason ? `<p class="err">${escapeHtml(reason)}</p>` : ""}<input name="key" type="password" placeholder="Password admin" autofocus><button type="submit">Entra</button></form></body></html>`;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Credenziali Supabase mancanti");
  return { url, key };
}

async function sb(path) {
  const { url, key } = getSupabase();
  const response = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Errore Supabase ${response.status}`);
  return text ? JSON.parse(text) : [];
}

function money(cents) {
  return `€ ${(Number(cents || 0) / 100).toFixed(2).replace(".", ",")}`;
}

function countBy(rows, fn) {
  return rows.reduce((acc, row) => {
    const key = fn(row) || "Non indicato";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function sumBy(rows, fn) {
  return rows.reduce((sum, row) => sum + Number(fn(row) || 0), 0);
}

function table(rows, columns) {
  if (!rows || !rows.length) return `<p class="muted">Nessun dato disponibile.</p>`;
  return `<div class="table-wrap"><table><thead><tr>${columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((c) => `<td>${escapeHtml(typeof c.value === "function" ? c.value(row) : row[c.value])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function kvRows(obj) {
  return Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
}

function extractItems(tableOrders) {
  const result = [];
  for (const order of tableOrders || []) {
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      const name = item.name || item.nome || item.productName || item.title || item.product_id || "Voce non riconosciuta";
      const qty = Number(item.quantity || item.qty || 1);
      const type = item.type || item.category || item.product_type || "Non indicato";
      result.push({ name, qty, type, order_created_at: order.created_at, table_id: order.table_id });
    }
  }
  return result;
}

function aggregateItems(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.name;
    if (!map.has(key)) map.set(key, { name: key, qty: 0, type: item.type });
    map.get(key).qty += item.qty;
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty);
}

function page(data, key) {
  const bookingByDate = kvRows(countBy(data.bookings, (b) => b.booking_date));
  const bookingByWeekday = kvRows(countBy(data.bookings, (b) => b.booking_date ? WEEKDAYS[new Date(`${b.booking_date}T00:00:00`).getDay()] : "Non indicato"));
  const voteCounts = kvRows(countBy(data.votes, (v) => v.choice));
  const extractedItems = extractItems(data.tableOrders);
  const soldItems = aggregateItems(extractedItems);
  const totalRevenueCents = sumBy(data.tableSessions, (s) => s.total_cents) + sumBy(data.orders, (o) => o.total_cents);
  const paidRevenueCents = sumBy(data.tableSessions, (s) => s.paid_cents) + sumBy(data.orders, (o) => o.paid_cents);
  const mostVoted = voteCounts[0];
  const mostSold = soldItems[0];

  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contabilità AL DOGE</title><style>body{margin:0;background:#050403;color:#f3ead9;font-family:Arial,sans-serif}.page{max-width:1220px;margin:auto;padding:22px}.top{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:14px}h1{color:#d2ba7c;margin:0}h2{color:#d2ba7c;margin-top:0}.muted{color:#b8ad9b}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.three{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{border:1px solid rgba(210,186,124,.34);background:#11100d;border-radius:18px;padding:16px;margin-bottom:14px}.metric strong{display:block;color:#d2ba7c;font-size:30px}.metric span{color:#b8ad9b;font-size:13px}.highlight{font-size:20px;color:#d2ba7c;font-weight:900}.warn{border-color:rgba(255,180,120,.55);color:#ffcfaa}.btn{border:1px solid rgba(210,186,124,.38);border-radius:999px;padding:9px 12px;color:#d2ba7c;text-decoration:none;font-weight:900;font-size:13px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid rgba(210,186,124,.16);padding:8px;text-align:left;vertical-align:top}th{color:#d2ba7c}.table-wrap{overflow:auto}@media(max-width:900px){.top{display:block}.grid,.three,.two{grid-template-columns:1fr}table{font-size:12px}}</style></head><body><main class="page"><div class="top"><div><h1>Contabilità AL DOGE</h1><p class="muted">Dashboard privata: andamento locale, clienti, promozioni e vendite.</p></div><a class="btn" href="/.netlify/functions/admin-contabilita?key=${encodeURIComponent(key)}">Aggiorna</a></div><section class="grid"><div class="card metric"><strong>${data.bookings.length}</strong><span>Prenotazioni salvate</span></div><div class="card metric"><strong>${data.customers.length}</strong><span>Clienti in database</span></div><div class="card metric"><strong>${data.votes.length}</strong><span>Voti promozione</span></div><div class="card metric"><strong>${money(totalRevenueCents)}</strong><span>Totale ordini/tavoli registrati</span></div></section><section class="three"><div class="card"><h2>Pizza più votata</h2><div class="highlight">${mostVoted ? `${escapeHtml(mostVoted.name)} (${mostVoted.value})` : "Nessun voto"}</div><p class="muted">Dati da promozione Giovedì del Doge.</p></div><div class="card"><h2>Prodotto più venduto</h2><div class="highlight">${mostSold ? `${escapeHtml(mostSold.name)} (${mostSold.qty})` : "Non disponibile"}</div><p class="muted">Richiede ordini/tavoli salvati con righe prodotto.</p></div><div class="card"><h2>Incassato registrato</h2><div class="highlight">${money(paidRevenueCents)}</div><p class="muted">Da ordini/tavoli pagati nel database.</p></div></section><section class="card warn"><strong>Nota dati vendite:</strong> in Supabase esistono tabelle ordini/tavoli, ma al momento molte risultano vuote. Le pizze più vendute e gli ingredienti più usati saranno attendibili solo quando il portale tavoli/ordini salverà ogni riga prodotto chiusa.</section><section class="two"><div class="card"><h2>Giornate con più prenotazioni</h2>${table(bookingByWeekday, [{ label: "Giorno", value: "name" }, { label: "Prenotazioni", value: "value" }])}</div><div class="card"><h2>Voti promozione</h2>${table(voteCounts, [{ label: "Pizza", value: "name" }, { label: "Voti", value: "value" }])}</div></section><section class="two"><div class="card"><h2>Ultime prenotazioni</h2>${table(data.bookings, [{ label: "Nome", value: "full_name" }, { label: "Telefono", value: "phone" }, { label: "Data", value: "booking_date" }, { label: "Ora", value: "booking_time" }, { label: "Persone", value: "people" }, { label: "Stato", value: "status" }])}</div><div class="card"><h2>Clienti</h2>${table(data.customers, [{ label: "Nome", value: "full_name" }, { label: "Telefono", value: "phone" }, { label: "Prenotazioni", value: "total_bookings" }, { label: "Ultima visita", value: "last_seen_at" }])}</div></section><section class="two"><div class="card"><h2>Pizze/prodotti più venduti</h2>${table(soldItems.slice(0, 20), [{ label: "Prodotto", value: "name" }, { label: "Quantità", value: "qty" }, { label: "Tipo", value: "type" }])}</div><div class="card"><h2>Date con più prenotazioni</h2>${table(bookingByDate, [{ label: "Data", value: "name" }, { label: "Prenotazioni", value: "value" }])}</div></section></main></body></html>`;
}

exports.handler = async function (event) {
  try {
    const key = (event.queryStringParameters || {}).key || "";
    if (!getAdminPassword()) return html(500, loginPage("Password admin non configurata in Netlify."));
    if (!isAuthorized(event)) return html(401, loginPage(key ? "Password non valida." : ""));

    const [bookings, customers, votes, tableOrders, tableSessions, orders, orderItems, payments] = await Promise.all([
      sb("booking_requests?select=*&order=created_at.desc&limit=200"),
      sb("customers?select=*&order=created_at.desc&limit=200"),
      sb("promotion_votes?select=*&order=created_at.desc&limit=500"),
      sb("table_orders?select=*&order=created_at.desc&limit=500"),
      sb("table_sessions?select=*&order=opened_at.desc&limit=500"),
      sb("orders?select=*&order=created_at.desc&limit=500"),
      sb("order_items?select=*&limit=1000"),
      sb("payments?select=*&order=created_at.desc&limit=500"),
    ]);

    return html(200, page({ bookings, customers, votes, tableOrders, tableSessions, orders, orderItems, payments }, key));
  } catch (error) {
    return html(500, `<pre style="white-space:pre-wrap;background:#050403;color:#ffb4a8;padding:20px">Errore dashboard: ${escapeHtml(error.message || error)}</pre>`);
  }
};
