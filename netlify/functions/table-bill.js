const { getStore } = require('@netlify/blobs');
const fs = require('node:fs/promises');
const path = require('node:path');

const TABLE_MIN = 1;
const TABLE_MAX = 10;
const STORE_NAME = 'table-bills';
const LOCAL_STORE_PATH = path.join(process.cwd(), '.netlify', 'local-table-bills.json');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function toNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTable(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < TABLE_MIN || parsed > TABLE_MAX) {
    return null;
  }
  return parsed;
}

function normalizeItem(rawItem) {
  if (!rawItem || typeof rawItem !== 'object') {
    return null;
  }

  const name = String(rawItem.name || '').trim();
  if (!name) {
    return null;
  }

  const rawQty = rawItem.qty ?? rawItem.quantity ?? 1;
  const qty = Math.max(1, Number.parseInt(rawQty, 10) || 1);
  const price = toNumber(rawItem.price ?? rawItem.unitPrice);
  const explicitSubtotal = toNumber(rawItem.subtotal ?? rawItem.total ?? rawItem.lineTotal);
  const subtotal = explicitSubtotal !== null
    ? explicitSubtotal
    : (price !== null ? price * qty : null);

  return {
    name,
    qty,
    price,
    subtotal
  };
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems)) {
    return [];
  }
  return rawItems.map(normalizeItem).filter(Boolean);
}

function computeTotal(items, providedTotal) {
  const explicitTotal = toNumber(providedTotal);
  if (explicitTotal !== null && explicitTotal >= 0) {
    return explicitTotal;
  }

  return items.reduce((sum, item) => {
    const subtotal = toNumber(item.subtotal);
    return sum + (subtotal !== null ? subtotal : 0);
  }, 0);
}

function response(statusCode, payload) {
  return {
    statusCode,
    headers: HEADERS,
    body: JSON.stringify(payload)
  };
}

function resolveStorage() {
  try {
    return {
      kind: 'blobs',
      store: getStore(STORE_NAME)
    };
  } catch (error) {
    if (error && error.name === 'MissingBlobsEnvironmentError') {
      return { kind: 'memory' };
    }
    throw error;
  }
}

async function loadBill(storage, key) {
  if (storage.kind === 'blobs') {
    return storage.store.get(key, { type: 'json' });
  }

  try {
    const raw = await fs.readFile(LOCAL_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed[key] || null) : null;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function saveBill(storage, key, bill) {
  if (storage.kind === 'blobs') {
    await storage.store.setJSON(key, bill);
    return;
  }

  await fs.mkdir(path.dirname(LOCAL_STORE_PATH), { recursive: true });
  let current = {};
  try {
    const raw = await fs.readFile(LOCAL_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      current = parsed;
    }
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }

  current[key] = bill;
  await fs.writeFile(LOCAL_STORE_PATH, JSON.stringify(current, null, 2), 'utf8');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  const storage = resolveStorage();

  if (event.httpMethod === 'GET') {
    const table = normalizeTable(event.queryStringParameters?.table);
    if (!table) {
      return response(400, { ok: false, error: 'INVALID_TABLE' });
    }

    const key = `table-${table}`;
    const bill = await loadBill(storage, key);
    return response(200, {
      ok: true,
      table,
      bill: bill || null
    });
  }

  if (event.httpMethod === 'PUT') {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (error) {
      return response(400, { ok: false, error: 'INVALID_JSON' });
    }

    const table = normalizeTable(payload.table);
    if (!table) {
      return response(400, { ok: false, error: 'INVALID_TABLE' });
    }

    const items = normalizeItems(payload.items);
    const total = computeTotal(items, payload.total);
    const paymentMode = payload.paymentMode === 'split' ? 'split' : 'single';
    const splitCount = paymentMode === 'split'
      ? Math.max(2, Number.parseInt(payload.splitCount, 10) || 2)
      : null;

    const bill = {
      table,
      items,
      total: Number(total.toFixed(2)),
      paymentMode,
      splitCount,
      updatedAt: new Date().toISOString()
    };

    const key = `table-${table}`;
    await saveBill(storage, key, bill);

    return response(200, {
      ok: true,
      table,
      bill
    });
  }

  return response(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
};
