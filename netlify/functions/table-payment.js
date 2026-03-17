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
  const originalTotal = parseMoney(source.originalTotal);
  const remainingTotal = parseMoney(source.remainingTotal);
  const paymentMode = source.paymentMode === 'split' ? 'split' : 'full';
  const splitMode = source.splitMode === 'split' || paymentMode === 'split' ? 'split' : 'full';
  const totalShares = Math.max(0, Number.parseInt(source.totalShares, 10) || (paymentMode === 'split' ? SPLIT_MIN_SHARES : 1));
  const paidShares = Math.max(0, Number.parseInt(source.paidShares, 10) || 0);
  const remainingShares = Math.max(0, Number.parseInt(source.remainingShares, 10) || Math.max(0, totalShares - paidShares));
  const paymentStatus = ['open', 'partial', 'partially_paid', 'paid'].includes(String(source.paymentStatus || '').trim())
    ? String(source.paymentStatus).trim()
    : (total > 0 ? 'open' : 'paid');

  return {
    tableNumber,
    items,
    total,
    paymentStatus,
    paymentMode,
    splitMode,
    totalShares,
    paidShares: Math.min(totalShares, paidShares),
    remainingShares: Math.min(totalShares, remainingShares),
    originalTotal: round2(originalTotal ?? total),
    remainingTotal: round2(remainingTotal ?? total),
    note: typeof source.note === 'string' ? source.note.trim() : '',
    paymentCode: typeof source.paymentCode === 'string' ? source.paymentCode.trim() : '',
    updatedAt: source.updatedAt || new Date().toISOString(),
  };
}

function computeSplitAmount(total, splitShares, splitShareIndex) {
  const totalCents = roundToCents(total);
  const shares = Math.max(1, Math.min(SPLIT_MAX_SHARES, splitShares));
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

async function saveRawBill(tableNumber, bill) {
  const keys = [`table-${tableNumber}`, `table-bill:${tableNumber}`];
  const store = getBlobStore();
  if (store) {
    await Promise.all(keys.map((key) => store.setJSON(key, bill)));
    return;
  }

  await fs.mkdir(path.dirname(LOCAL_STORE_PATH), { recursive: true });
  let parsed = {};
  try {
    const raw = await fs.readFile(LOCAL_STORE_PATH, 'utf8');
    const existing = JSON.parse(raw);
    if (existing && typeof existing === 'object') {
      parsed = existing;
    }
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }

  keys.forEach((key) => { parsed[key] = bill; });
  await fs.writeFile(LOCAL_STORE_PATH, JSON.stringify(parsed, null, 2), 'utf8');
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

  const requestedMode = payload.paymentMode === 'split' ? 'split' : 'full';
  const requestedShares = Number.parseInt(payload.splitShares, 10) || SPLIT_MIN_SHARES;
  const requestedShareIndex = Number.parseInt(payload.splitShareIndex, 10) || 1;

  const rawBill = await loadRawBill(tableNumber);
  if (!rawBill) {
    return respond(404, { ok: false, error: 'BILL_NOT_FOUND' });
  }

  const bill = normalizeBillShape(rawBill.bill || rawBill, tableNumber);
  const effectiveTotal = bill.paymentStatus === 'partial'
    ? round2(bill.remainingTotal)
    : round2(bill.total);
  if (!Number.isFinite(effectiveTotal) || effectiveTotal <= 0) {
    return respond(400, { ok: false, error: 'EMPTY_BILL' });
  }

  const isOngoingSplit = bill.paymentStatus === 'partial' && bill.remainingShares > 0;
  const paymentMode = isOngoingSplit ? 'split' : requestedMode;
  const normalizedShares = isOngoingSplit
    ? Math.max(1, Math.min(SPLIT_MAX_SHARES, bill.remainingShares))
    : Math.max(SPLIT_MIN_SHARES, Math.min(SPLIT_MAX_SHARES, requestedShares));
  const normalizedShareIndex = isOngoingSplit
    ? 1
    : Math.max(1, Math.min(normalizedShares, requestedShareIndex));

  const payableAmount = paymentMode === 'split'
    ? computeSplitAmount(effectiveTotal, normalizedShares, normalizedShareIndex)
    : round2(effectiveTotal);

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
      billTotal: effectiveTotal.toFixed(2),
      originalTotal: round2(bill.originalTotal || bill.total).toFixed(2),
      priorPaidShares: String(Math.max(0, Number.parseInt(bill.paidShares, 10) || 0)),
      priorTotalShares: String(Math.max(0, Number.parseInt(bill.totalShares, 10) || 0)),
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
    billTotal: round2(effectiveTotal),
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
  const fallbackOriginalTotal = parseMoney(metadata.originalTotal);
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
  if (alreadyConfirmed) {
    return respond(200, {
      ok: true,
      paid: true,
      alreadyConfirmed: true,
      tableNumber,
      paymentMode: bill.paymentMode || paymentMode,
      splitShares: Math.max(0, Number.parseInt(bill.totalShares, 10) || splitShares),
      splitShareIndex,
      billTotal: round2(parseMoney(bill.originalTotal) ?? bill.total),
      payableAmount: paidAmount,
      paymentStatus: bill.paymentStatus || 'open',
      totalShares: Math.max(0, Number.parseInt(bill.totalShares, 10) || 0),
      paidShares: Math.max(0, Number.parseInt(bill.paidShares, 10) || 0),
      remainingShares: Math.max(0, Number.parseInt(bill.remainingShares, 10) || 0),
      originalTotal: round2(parseMoney(bill.originalTotal) ?? bill.total),
      remainingTotal: round2(parseMoney(bill.remainingTotal) ?? bill.total),
      sessionId: session.id,
    });
  }

  const baseOriginalTotal = Number.isFinite(parseMoney(bill.originalTotal))
    ? round2(parseMoney(bill.originalTotal))
    : round2(Number.isFinite(fallbackOriginalTotal) ? fallbackOriginalTotal : bill.total);
  const currentRemainingTotal = bill.paymentStatus === 'partial'
    ? round2(bill.remainingTotal)
    : round2(bill.total);
  const safeCurrentRemaining = Math.max(0, currentRemainingTotal);
  const nextRemainingTotal = round2(Math.max(0, safeCurrentRemaining - paidAmount));
  const priorPaidShares = Math.max(
    0,
    Number.parseInt(metadata.priorPaidShares, 10)
      || Number.parseInt(bill.paidShares, 10)
      || 0
  );
  const priorTotalShares = Math.max(
    0,
    Number.parseInt(metadata.priorTotalShares, 10)
      || Number.parseInt(bill.totalShares, 10)
      || 0
  );
  const effectiveTotalShares = paymentMode === 'split'
    ? Math.max(SPLIT_MIN_SHARES, priorTotalShares || splitShares)
    : 1;
  const nextPaidShares = paymentMode === 'split'
    ? Math.min(effectiveTotalShares, priorPaidShares + 1)
    : 1;
  const nextRemainingShares = paymentMode === 'split'
    ? Math.max(0, effectiveTotalShares - nextPaidShares)
    : 0;
  const isFullyPaid = nextRemainingTotal <= 0 || nextRemainingShares === 0 || paymentMode === 'full';

  const updatedBill = {
    ...bill,
    paymentMode: paymentMode === 'split' ? 'split' : 'full',
    splitMode: paymentMode === 'split' ? 'split' : 'full',
    paymentStatus: isFullyPaid ? 'paid' : 'partial',
    totalShares: effectiveTotalShares,
    paidShares: nextPaidShares,
    remainingShares: nextRemainingShares,
    originalTotal: baseOriginalTotal,
    remainingTotal: isFullyPaid ? 0 : nextRemainingTotal,
    total: isFullyPaid ? 0 : nextRemainingTotal,
    updatedAt: new Date().toISOString(),
  };

  if (isFullyPaid) {
    updatedBill.items = [];
    updatedBill.note = '';
    updatedBill.paymentCode = '';
  }

  await saveRawBill(tableNumber, updatedBill);

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

  return respond(200, {
    ok: true,
    paid: true,
    alreadyConfirmed,
    tableNumber,
    paymentMode,
    splitShares: effectiveTotalShares,
    splitShareIndex,
    billTotal: round2(baseOriginalTotal),
    payableAmount: paidAmount,
    paymentStatus: updatedBill.paymentStatus,
    totalShares: updatedBill.totalShares,
    paidShares: updatedBill.paidShares,
    remainingShares: updatedBill.remainingShares,
    originalTotal: updatedBill.originalTotal,
    remainingTotal: updatedBill.remainingTotal,
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
