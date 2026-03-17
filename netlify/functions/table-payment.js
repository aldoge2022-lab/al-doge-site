const { connectLambda, getStore } = require('@netlify/blobs');
const fs = require('node:fs/promises');
const path = require('node:path');
const fetch = require('node-fetch');

const STORE_NAME = 'table-bills';
const LOCAL_STORE_PATH = path.join('/tmp', 'local-table-bills.json');
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

function roundToCents(value) {
  return Math.round((value + Number.EPSILON) * 100);
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

  const tableNumber = normalizeTableNumber(payload.tableNumber ?? payload.table);
  if (!tableNumber) {
    return respond(400, { ok: false, error: 'INVALID_TABLE' });
  }

  const paymentMode = payload.paymentMode === 'split' ? 'split' : 'full';
  const splitShares = Number.parseInt(payload.splitShares, 10) || SPLIT_MIN_SHARES;
  const splitShareIndex = Number.parseInt(payload.splitShareIndex, 10) || 1;

  try {
    const rawBill = await loadRawBill(tableNumber);
    if (!rawBill) {
      return respond(404, { ok: false, error: 'BILL_NOT_FOUND' });
    }

    const bill = normalizeBillShape(rawBill.bill || rawBill, tableNumber);
    if (!Number.isFinite(bill.total) || bill.total <= 0) {
      return respond(400, { ok: false, error: 'EMPTY_BILL' });
    }

    const payableAmount = paymentMode === 'split'
      ? computeSplitAmount(bill.total, splitShares, splitShareIndex)
      : round2(bill.total);

    const normalizedShares = Math.max(SPLIT_MIN_SHARES, Math.min(SPLIT_MAX_SHARES, splitShares));
    const normalizedShareIndex = Math.max(1, Math.min(normalizedShares, splitShareIndex));
    const splitLine = paymentMode === 'split'
      ? `\n👥 *Modalita:* Pagamento diviso (${normalizedShareIndex}/${normalizedShares})`
      : '\n👥 *Modalita:* Pagamento unico';

    const message = `
💳 *Pagamento tavolo ricevuto*

🪑 *Tavolo:* ${tableNumber}${splitLine}
💶 *Totale conto:* €${bill.total.toFixed(2)}
✅ *Importo pagato:* €${payableAmount.toFixed(2)}
🕒 *Ora:* ${new Date().toISOString()}
    `;

    await sendTelegramMessage(message);

    return respond(200, {
      ok: true,
      tableNumber,
      paymentMode,
      splitShares: normalizedShares,
      splitShareIndex: normalizedShareIndex,
      billTotal: round2(bill.total),
      payableAmount: round2(payableAmount),
    });
  } catch (error) {
    console.error('table-payment error', error);
    return respond(500, { ok: false, error: 'INTERNAL_ERROR' });
  }
};
