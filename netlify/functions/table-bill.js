const { connectLambda, getStore } = require('@netlify/blobs');
const fs = require('node:fs/promises');
const path = require('node:path');

const TABLE_MIN = 1;
const TABLE_MAX = 200;
const STORE_NAME = 'table-bills';
const LOCAL_STORE_PATH = path.join('/tmp', 'local-table-bills.json');

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTableNumber(input) {
  const raw = String(input ?? '').trim();
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < TABLE_MIN || parsed > TABLE_MAX) return null;
  return parsed;
}

function getTableFromEvent(event, payload) {
  return normalizeTableNumber(
    event?.queryStringParameters?.table
      ?? event?.queryStringParameters?.tableNumber
      ?? event?.queryStringParameters?.t
      ?? payload?.table
      ?? payload?.tableNumber
      ?? payload?.tableId
      ?? payload?.bill?.table
      ?? payload?.bill?.tableNumber
      ?? payload?.bill?.tableId
  );
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
    if (typeof item.price === 'number') return sum + (item.price * item.qty);
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
  const totalShares = Math.max(1, Number.parseInt(source.totalShares, 10) || (paymentMode === 'split' ? 2 : 1));
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
    updatedAt: source.updatedAt || new Date().toISOString(),
  };
}

function buildEmptyBill(tableNumber) {
  return {
    tableNumber,
    status: 'empty',
    items: [],
    total: 0,
    paymentStatus: 'unpaid',
    paymentMode: 'full',
    splitMode: 'none',
    totalShares: 1,
    paidShares: 0,
    remainingShares: 0,
    originalTotal: 0,
    remainingTotal: 0,
    updatedAt: null,
  };
}

async function loadFromAnyKey(tableNumber) {
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
    if (error && error.code !== 'ENOENT') {
      throw error;
    }
  }

  return null;
}

async function saveAllKeys(tableNumber, bill) {
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

exports.handler = async (event) => {
  try {
    connectLambda(event);
  } catch (_) {
    // Ignore when not required; getStore fallback logic will handle availability.
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  const method = String(event.httpMethod || '').toUpperCase();
  const isWriteMethod = method === 'PUT' || method === 'POST';

  if (method !== 'GET' && !isWriteMethod) {
    return respond(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  let payload = {};
  if (isWriteMethod) {
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (_) {
      return respond(400, { ok: false, error: 'INVALID_JSON' });
    }
  }

  const tableNumber = getTableFromEvent(event, payload);
  if (!tableNumber) {
    return respond(400, { ok: false, error: 'INVALID_TABLE' });
  }

  try {
    if (isWriteMethod) {
      const bill = normalizeBillShape(payload.bill || payload, tableNumber);
      await saveAllKeys(tableNumber, bill);
      return respond(200, {
        ok: true,
        tableNumber,
        empty: bill.items.length === 0 && bill.total <= 0,
        bill,
      });
    }

    const stored = await loadFromAnyKey(tableNumber);
    if (!stored) {
      return respond(200, {
        ok: true,
        tableNumber,
        empty: true,
        message: 'Nessun conto aperto per questo tavolo',
        bill: buildEmptyBill(tableNumber),
      });
    }

    const bill = normalizeBillShape(stored.bill || stored, tableNumber);
    const empty = bill.items.length === 0 && bill.total <= 0;
    const keepBillShape = empty && bill.paymentStatus === 'paid';

    return respond(200, {
      ok: true,
      tableNumber,
      empty,
      ...(empty ? { message: 'Nessun conto aperto per questo tavolo' } : {}),
      bill: empty ? (keepBillShape ? bill : buildEmptyBill(tableNumber)) : bill,
    });
  } catch (error) {
    console.error('table-bill error', error);
    return respond(500, { ok: false, error: 'INTERNAL_ERROR' });
  }
};
