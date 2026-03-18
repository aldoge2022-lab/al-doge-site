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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
  const derivedTotal = computeTotal(items, source.total);
  const originalTotal = parseMoney(source.originalTotal);
  const remainingTotal = parseMoney(source.remainingTotal);
  const normalizedOriginalTotal = Number.isFinite(originalTotal) && originalTotal >= 0
    ? round2(originalTotal)
    : round2(derivedTotal);
  const normalizedRemainingTotal = Number.isFinite(remainingTotal) && remainingTotal >= 0
    ? round2(remainingTotal)
    : round2(normalizedOriginalTotal);
  const paymentModeRaw = String(source.paymentMode ?? '').trim().toLowerCase();
  const paymentMode = paymentModeRaw === 'split' ? 'split' : 'full';
  const splitModeRaw = String(source.splitMode ?? '').trim().toLowerCase();
  const splitMode = paymentMode === 'split' && (splitModeRaw === 'split' || splitModeRaw === 'equal')
    ? 'split'
    : 'none';
  const totalShares = Math.max(1, Number.parseInt(source.totalShares, 10) || (paymentMode === 'split' ? SPLIT_MIN_SHARES : 1));
  const paidShares = clamp(Number.parseInt(source.paidShares, 10) || 0, 0, totalShares);
  const remainingShares = clamp(
    Number.parseInt(source.remainingShares, 10) || Math.max(0, totalShares - paidShares),
    0,
    totalShares
  );
  const paymentStatus = source.paymentStatus === 'paid'
    ? 'paid'
    : source.paymentStatus === 'partial'
      ? 'partial'
      : normalizedRemainingTotal <= 0
        ? 'paid'
        : paidShares > 0
          ? 'partial'
          : 'unpaid';

  return {
    tableNumber,
    items,
    total: round2(normalizedRemainingTotal),
    note: typeof source.note === 'string' ? source.note.trim() : '',
    paymentCode: typeof source.paymentCode === 'string' ? source.paymentCode.trim() : '',
    paymentStatus,
    paymentMode,
    splitMode,
    totalShares,
    paidShares,
    remainingShares,
    originalTotal: round2(normalizedOriginalTotal),
    remainingTotal: round2(normalizedRemainingTotal),
  };
}

function computeSplitAmount(total, splitShares, splitShareIndex) {
  const totalCents = roundToCents(total);
  const shares = clamp(splitShares, 1, SPLIT_MAX_SHARES);
  const index = clamp(splitShareIndex, 1, shares);
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

async function trySendTelegramMessage(message) {
  try {
    await sendTelegramMessage(message);
    return { sent: true };
  } catch (error) {
    console.warn('table-payment telegram notify skipped', error?.message || error);
    return { sent: false, reason: error?.message || 'UNKNOWN' };
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
  const normalizedShares = clamp(splitShares, SPLIT_MIN_SHARES, SPLIT_MAX_SHARES);
  const normalizedShareIndex = clamp(splitShareIndex, 1, normalizedShares);

  const rawBill = await loadRawBill(tableNumber);
  if (!rawBill) {
    return respond(404, { ok: false, error: 'BILL_NOT_FOUND' });
  }

  const bill = normalizeBillShape(rawBill.bill || rawBill, tableNumber);
  if (!Number.isFinite(bill.total) || bill.total <= 0) {
    return respond(400, { ok: false, error: 'EMPTY_BILL' });
  }
  if (bill.paymentStatus === 'paid') {
    return respond(409, { ok: false, error: 'BILL_ALREADY_PAID', tableNumber });
  }

  const effectiveTotalShares = paymentMode === 'split'
    ? (bill.paymentMode === 'split' ? clamp(bill.totalShares, SPLIT_MIN_SHARES, SPLIT_MAX_SHARES) : normalizedShares)
    : 1;
  const effectivePaidShares = paymentMode === 'split' && bill.paymentMode === 'split'
    ? clamp(bill.paidShares, 0, effectiveTotalShares)
    : 0;
  const effectiveRemainingShares = paymentMode === 'split'
    ? Math.max(
      1,
      bill.paymentMode === 'split'
        ? clamp(
          Number.parseInt(bill.remainingShares, 10) || Math.max(0, effectiveTotalShares - effectivePaidShares),
          0,
          effectiveTotalShares
        )
        : effectiveTotalShares
    )
    : 1;
  const effectiveTotal = paymentMode === 'split'
    ? round2(Number.isFinite(bill.remainingTotal) && bill.remainingTotal > 0 ? bill.remainingTotal : bill.total)
    : round2(bill.total);

  const payableAmount = paymentMode === 'split'
    ? computeSplitAmount(effectiveTotal, effectiveRemainingShares, clamp(normalizedShareIndex, 1, effectiveRemainingShares))
    : round2(bill.total);

  if (!Number.isFinite(payableAmount) || payableAmount <= 0) {
    return respond(400, { ok: false, error: 'INVALID_PAYABLE_AMOUNT' });
  }

  const siteOrigin = inferSiteOrigin(event);
  const successUrl = `${siteOrigin}/pay.html?table=${tableNumber}&payment=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${siteOrigin}/pay.html?table=${tableNumber}&payment=cancelled`;

  const itemName = paymentMode === 'split'
    ? `Pagamento quota tavolo ${tableNumber} (${clamp(normalizedShareIndex, 1, effectiveRemainingShares)}/${effectiveRemainingShares})`
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
      splitMode: paymentMode === 'split' ? 'split' : 'none',
      splitShares: String(effectiveTotalShares),
      splitShareIndex: String(clamp(normalizedShareIndex, 1, effectiveRemainingShares)),
      billTotal: effectiveTotal.toFixed(2),
      payableAmount: payableAmount.toFixed(2),
      originalTotal: round2(bill.originalTotal || bill.total).toFixed(2),
      paidShares: String(effectivePaidShares),
      remainingShares: String(effectiveRemainingShares),
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
    splitShares: effectiveTotalShares,
    splitShareIndex: clamp(normalizedShareIndex, 1, effectiveRemainingShares),
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
  const splitShares = clamp(Number.parseInt(metadata.splitShares, 10) || SPLIT_MIN_SHARES, SPLIT_MIN_SHARES, SPLIT_MAX_SHARES);
  const splitShareIndex = clamp(Number.parseInt(metadata.splitShareIndex, 10) || 1, 1, splitShares);

  const fallbackTotal = parseMoney(metadata.billTotal);
  const fallbackPayable = parseMoney(metadata.payableAmount);
  const rawBill = await loadRawBill(tableNumber);
  const bill = rawBill ? normalizeBillShape(rawBill.bill || rawBill, tableNumber) : {
    tableNumber,
    items: [],
    total: Number.isFinite(fallbackTotal) ? round2(fallbackTotal) : 0,
    note: '',
    paymentCode: '',
    paymentStatus: 'unpaid',
    paymentMode: paymentMode === 'split' ? 'split' : 'full',
    splitMode: paymentMode === 'split' ? 'split' : 'none',
    totalShares: paymentMode === 'split' ? splitShares : 1,
    paidShares: 0,
    remainingShares: paymentMode === 'split' ? splitShares : 0,
    originalTotal: Number.isFinite(fallbackTotal) ? round2(fallbackTotal) : 0,
    remainingTotal: Number.isFinite(fallbackTotal) ? round2(fallbackTotal) : 0,
  };

  const paidAmount = Number.isFinite(fallbackPayable)
    ? round2(fallbackPayable)
    : round2((session.amount_total || 0) / 100);

  const alreadyConfirmed = await hasConfirmedPayment(session.id);
  if (!alreadyConfirmed) {
    const currentOriginalTotal = round2(
      Number.isFinite(bill.originalTotal) && bill.originalTotal >= 0
        ? bill.originalTotal
        : bill.total
    );
    const currentRemainingTotal = round2(
      Number.isFinite(bill.remainingTotal) && bill.remainingTotal >= 0
        ? bill.remainingTotal
        : bill.total
    );

    let updatedBill = {
      ...bill,
      originalTotal: currentOriginalTotal,
      remainingTotal: currentRemainingTotal,
    };

    if (paymentMode === 'split') {
      const currentTotalShares = clamp(bill.totalShares || splitShares, SPLIT_MIN_SHARES, SPLIT_MAX_SHARES);
      const currentPaidShares = clamp(bill.paidShares || 0, 0, currentTotalShares);
      const currentRemainingShares = clamp(
        bill.remainingShares || Math.max(0, currentTotalShares - currentPaidShares),
        0,
        currentTotalShares
      );
      const nextRemainingShares = Math.max(0, currentRemainingShares - 1);
      const nextPaidShares = clamp(currentTotalShares - nextRemainingShares, 0, currentTotalShares);
      const nextRemainingTotal = round2(Math.max(0, currentRemainingTotal - paidAmount));
      const isPaid = nextRemainingShares === 0 || nextRemainingTotal <= 0;

      updatedBill = {
        ...updatedBill,
        paymentMode: 'split',
        splitMode: 'split',
        totalShares: currentTotalShares,
        paidShares: nextPaidShares,
        remainingShares: isPaid ? 0 : nextRemainingShares,
        remainingTotal: isPaid ? 0 : nextRemainingTotal,
        total: isPaid ? 0 : nextRemainingTotal,
        paymentStatus: isPaid ? 'paid' : 'partial',
        ...(isPaid
          ? {
            items: [],
            paymentCode: '',
            note: '',
          }
          : {}),
      };
    } else {
      updatedBill = {
        ...updatedBill,
        paymentMode: 'full',
        splitMode: 'none',
        totalShares: 1,
        paidShares: 1,
        remainingShares: 0,
        remainingTotal: 0,
        total: 0,
        paymentStatus: 'paid',
        items: [],
        paymentCode: '',
        note: '',
      };
    }

    await saveRawBill(tableNumber, updatedBill);

    const splitLine = paymentMode === 'split'
      ? `\n👥 *Modalita:* Pagamento diviso (${splitShareIndex}/${splitShares})`
      : '\n👥 *Modalita:* Pagamento unico';

    const message = `
💳 *Pagamento tavolo ricevuto*

🪑 *Tavolo:* ${tableNumber}${splitLine}
💶 *Totale conto:* €${round2(currentOriginalTotal).toFixed(2)}
✅ *Importo pagato:* €${paidAmount.toFixed(2)}
🧾 *Stripe Session:* ${session.id}
🕒 *Ora:* ${new Date().toISOString()}
    `;

    await trySendTelegramMessage(message);
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
