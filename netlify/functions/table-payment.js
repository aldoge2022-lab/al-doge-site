const Stripe = require('stripe');
const { connectLambda, getStore } = require('@netlify/blobs');
const fs = require('node:fs/promises');
const path = require('node:path');
const fetch = require('node-fetch');

const STORE_NAME = 'table-bills';
const LOCAL_STORE_PATH = path.join('/tmp', 'local-table-bills.json');
const LOCAL_PAYMENTS_PATH = path.join('/tmp', 'local-table-payments.json');
const TABLE_MIN = 1;
const TABLE_MAX = 200;
const SPLIT_MIN_SHARES = 2;
const SPLIT_MAX_SHARES = 12;

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

let blobStore = null;
let blobStoreUnavailable = false;
let stripeClient = null;

function respond(statusCode, payload) {
  return {
    statusCode,
    headers: HEADERS,
    body: JSON.stringify(payload),
  };
}

function parseMoney(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim().replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundToCents(value) {
  return Math.round((value + Number.EPSILON) * 100);
}

function normalizeTableNumber(input) {
  const parsed = Number.parseInt(String(input ?? '').trim(), 10);
  if (!Number.isInteger(parsed) || parsed < TABLE_MIN || parsed > TABLE_MAX) return null;
  return parsed;
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name = String(item.name ?? '').trim();
      if (!name) return null;
      const qty = Math.max(1, Number.parseInt(item.qty ?? item.quantity, 10) || 1);
      const price = parseMoney(item.price ?? item.unitPrice);
      const subtotal = parseMoney(item.subtotal ?? item.lineTotal ?? item.total);
      return {
        name,
        qty,
        ...(price !== null ? { price: round2(price) } : {}),
        ...(subtotal !== null ? { subtotal: round2(subtotal) } : {}),
      };
    })
    .filter(Boolean);
}

function computeTotal(items, explicitTotal) {
  const totalFromPayload = parseMoney(explicitTotal);
  if (totalFromPayload !== null && totalFromPayload >= 0) {
    return round2(totalFromPayload);
  }
  const derived = items.reduce((sum, item) => {
    if (typeof item.subtotal === 'number') return sum + item.subtotal;
    if (typeof item.price === 'number') return sum + item.price * item.qty;
    return sum;
  }, 0);
  return round2(derived);
}

function normalizeBillShape(rawBill, tableNumber) {
  const source = rawBill && typeof rawBill === 'object' ? rawBill : {};
  const items = normalizeItems(source.items);
  const total = computeTotal(items, source.total);
  return {
    tableNumber,
    items,
    total,
    note: typeof source.note === 'string' ? source.note.trim() : '',
    paymentCode: typeof source.paymentCode === 'string' ? source.paymentCode.trim() : '',
  };
}

function computeSplitAmount(total, splitShares, splitShareIndex) {
  const totalCents = roundToCents(total);
  const shares = Math.max(SPLIT_MIN_SHARES, Math.min(SPLIT_MAX_SHARES, splitShares));
  const index = Math.max(1, Math.min(shares, splitShareIndex));
  const baseShare = Math.floor(totalCents / shares);
  const remainder = totalCents % shares;
  const shareCents = baseShare + (index <= remainder ? 1 : 0);
  return shareCents / 100;
}

function getBlobStore() {
  if (blobStoreUnavailable) return null;
  if (blobStore) return blobStore;

  try {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_AUTH_TOKEN;
    const options = token && siteID
      ? { name: STORE_NAME, siteID, token }
      : STORE_NAME;
    blobStore = getStore(options);
    return blobStore;
  } catch (error) {
    if (error && error.name === 'MissingBlobsEnvironmentError') {
      blobStoreUnavailable = true;
      return null;
    }
    throw error;
  }
}

function getStripeClient() {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }

  stripeClient = Stripe(secretKey);
  return stripeClient;
}

async function loadRawBill(tableNumber) {
  const keys = [`table-${tableNumber}`, `table-bill:${tableNumber}`];
  const store = getBlobStore();
  if (store) {
    for (const key of keys) {
      const value = await store.get(key, { type: 'json' });
      if (value) return value;
    }
  }

  try {
    const raw = await fs.readFile(LOCAL_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    for (const key of keys) {
      if (parsed[key]) return parsed[key];
    }
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error;
  }

  return null;
}

function getPaymentRecordKey(sessionId) {
  return `table-payment:${sessionId}`;
}

async function hasConfirmedPayment(sessionId) {
  const key = getPaymentRecordKey(sessionId);
  const store = getBlobStore();
  if (store) {
    const existing = await store.get(key, { type: 'json' });
    return Boolean(existing && existing.notifiedAt);
  }

  try {
    const raw = await fs.readFile(LOCAL_PAYMENTS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Boolean(parsed && parsed[key] && parsed[key].notifiedAt);
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error;
    return false;
  }
}

async function markPaymentConfirmed(sessionId, payload) {
  const key = getPaymentRecordKey(sessionId);
  const store = getBlobStore();
  if (store) {
    await store.setJSON(key, {
      sessionId,
      ...payload,
      notifiedAt: new Date().toISOString(),
    });
    return;
  }

  await fs.mkdir(path.dirname(LOCAL_PAYMENTS_PATH), { recursive: true });
  let parsed = {};
  try {
    const raw = await fs.readFile(LOCAL_PAYMENTS_PATH, 'utf8');
    const existing = JSON.parse(raw);
    if (existing && typeof existing === 'object') {
      parsed = existing;
    }
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }

  parsed[key] = {
    sessionId,
    ...payload,
    notifiedAt: new Date().toISOString(),
  };
  await fs.writeFile(LOCAL_PAYMENTS_PATH, JSON.stringify(parsed, null, 2), 'utf8');
}

function inferSiteOrigin(event) {
  const fallback = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL || 'https://al-doge.it';
  const headers = event && event.headers ? event.headers : {};
  const host = headers.host || headers.Host;
  const proto = headers['x-forwarded-proto'] || headers['X-Forwarded-Proto'] || 'https';

  if (!host) {
    return fallback;
  }

  return `${proto}://${host}`;
}

async function sendTelegramMessage(message) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    throw new Error('Missing Telegram credentials');
  }

  const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(telegramUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
    }),
  });

  if (!response.ok) {
    throw new Error('Telegram API error');
  }
}

async function createCheckoutSession(event, payload) {
  const tableNumber = normalizeTableNumber(payload.tableNumber ?? payload.table);
  if (!tableNumber) {
    return respond(400, { ok: false, error: 'INVALID_TABLE' });
  }

  const paymentMode = payload.paymentMode === 'split' ? 'split' : 'full';
  const splitShares = Number.parseInt(payload.splitShares, 10) || SPLIT_MIN_SHARES;
  const splitShareIndex = Number.parseInt(payload.splitShareIndex, 10) || 1;
  const normalizedShares = Math.max(SPLIT_MIN_SHARES, Math.min(SPLIT_MAX_SHARES, splitShares));
  const normalizedShareIndex = Math.max(1, Math.min(normalizedShares, splitShareIndex));

  const rawBill = await loadRawBill(tableNumber);
  if (!rawBill) {
    return respond(404, { ok: false, error: 'BILL_NOT_FOUND' });
  }

  const bill = normalizeBillShape(rawBill.bill || rawBill, tableNumber);
  if (!Number.isFinite(bill.total) || bill.total <= 0) {
    return respond(400, { ok: false, error: 'EMPTY_BILL' });
  }

  const payableAmount = paymentMode === 'split'
    ? computeSplitAmount(bill.total, normalizedShares, normalizedShareIndex)
    : round2(bill.total);

  if (!Number.isFinite(payableAmount) || payableAmount <= 0) {
    return respond(400, { ok: false, error: 'INVALID_PAYABLE_AMOUNT' });
  }

  const siteOrigin = inferSiteOrigin(event);
  const successUrl = `${siteOrigin}/pay.html?table=${tableNumber}&payment=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${siteOrigin}/pay.html?table=${tableNumber}&payment=cancelled`;

  const itemName = paymentMode === 'split'
    ? `Pagamento quota tavolo ${tableNumber} (${normalizedShareIndex}/${normalizedShares})`
    : `Pagamento tavolo ${tableNumber}`;

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: itemName,
          },
          unit_amount: roundToCents(payableAmount),
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      flow: 'table',
      tableNumber: String(tableNumber),
      paymentMode,
      splitShares: String(normalizedShares),
      splitShareIndex: String(normalizedShareIndex),
      billTotal: bill.total.toFixed(2),
      payableAmount: payableAmount.toFixed(2),
    },
  });

  if (!session || !session.url) {
    return respond(500, { ok: false, error: 'STRIPE_SESSION_URL_MISSING' });
  }

  return respond(200, {
    ok: true,
    checkoutUrl: session.url,
    sessionId: session.id,
    tableNumber,
    paymentMode,
    splitShares: normalizedShares,
    splitShareIndex: normalizedShareIndex,
    billTotal: round2(bill.total),
    payableAmount: round2(payableAmount),
  });
}

async function confirmCheckoutSession(payload) {
  const sessionId = String(payload.sessionId || '').trim();
  if (!sessionId) {
    return respond(400, { ok: false, error: 'MISSING_SESSION_ID' });
  }

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (!session) {
    return respond(404, { ok: false, error: 'SESSION_NOT_FOUND' });
  }

  const paid = session.payment_status === 'paid';
  if (!paid) {
    return respond(409, {
      ok: false,
      error: 'PAYMENT_NOT_COMPLETED',
      sessionStatus: session.status,
      paymentStatus: session.payment_status,
    });
  }

  const metadata = session.metadata || {};
  const tableNumber = normalizeTableNumber(metadata.tableNumber ?? payload.tableNumber ?? payload.table);
  if (!tableNumber) {
    return respond(400, { ok: false, error: 'INVALID_TABLE' });
  }

  const paymentMode = metadata.paymentMode === 'split' ? 'split' : 'full';
  const splitShares = Math.max(
    SPLIT_MIN_SHARES,
    Math.min(SPLIT_MAX_SHARES, Number.parseInt(metadata.splitShares, 10) || SPLIT_MIN_SHARES)
  );
  const splitShareIndex = Math.max(
    1,
    Math.min(splitShares, Number.parseInt(metadata.splitShareIndex, 10) || 1)
  );

  const fallbackTotal = parseMoney(metadata.billTotal);
  const fallbackPayable = parseMoney(metadata.payableAmount);
  const rawBill = await loadRawBill(tableNumber);
  const bill = rawBill ? normalizeBillShape(rawBill.bill || rawBill, tableNumber) : {
    tableNumber,
    items: [],
    total: Number.isFinite(fallbackTotal) ? round2(fallbackTotal) : 0,
    note: '',
    paymentCode: '',
  };

  const paidAmount = Number.isFinite(fallbackPayable)
    ? round2(fallbackPayable)
    : round2((session.amount_total || 0) / 100);

  const alreadyConfirmed = await hasConfirmedPayment(session.id);
  if (!alreadyConfirmed) {
    const splitLine = paymentMode === 'split'
      ? `\n👥 *Modalita:* Pagamento diviso (${splitShareIndex}/${splitShares})`
      : '\n👥 *Modalita:* Pagamento unico';

    const message = `
💳 *Pagamento tavolo ricevuto*

🪑 *Tavolo:* ${tableNumber}${splitLine}
💶 *Totale conto:* €${round2(bill.total).toFixed(2)}
✅ *Importo pagato:* €${paidAmount.toFixed(2)}
🧾 *Stripe Session:* ${session.id}
🕒 *Ora:* ${new Date().toISOString()}
    `;

    await sendTelegramMessage(message);
    await markPaymentConfirmed(session.id, {
      tableNumber,
      paymentMode,
      splitShares,
      splitShareIndex,
      billTotal: round2(bill.total),
      paidAmount,
    });
  }

  return respond(200, {
    ok: true,
    paid: true,
    alreadyConfirmed,
    tableNumber,
    paymentMode,
    splitShares,
    splitShareIndex,
    billTotal: round2(bill.total),
    payableAmount: paidAmount,
    sessionId: session.id,
  });
}

exports.handler = async (event) => {
  try {
    connectLambda(event);
  } catch (_) {
    // Running locally without blob context.
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  if (String(event.httpMethod || '').toUpperCase() !== 'POST') {
    return respond(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (_) {
    return respond(400, { ok: false, error: 'INVALID_JSON' });
  }

  const action = String(payload.action || 'create').trim().toLowerCase();

  try {
    if (action === 'confirm') {
      return await confirmCheckoutSession(payload);
    }

    return await createCheckoutSession(event, payload);
  } catch (error) {
    console.error('table-payment error', error);
    return respond(500, { ok: false, error: 'INTERNAL_ERROR' });
  }
};
