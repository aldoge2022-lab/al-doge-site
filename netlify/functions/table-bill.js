const fetch = require('node-fetch');

const TABLE_MIN = 1;
const TABLE_MAX = 200;

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function respond(statusCode, payload) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(payload) };
}

function parseMoney(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim().replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function round2(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

function normalizeTableNumber(input) {
  const parsed = Number.parseInt(String(input ?? '').trim(), 10);
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
  return rawItems.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const name = String(item.name ?? '').trim();
    if (!name) return null;
    const qty = Math.max(1, Number.parseInt(item.qty ?? item.quantity, 10) || 1);
    const price = parseMoney(item.price ?? item.unitPrice);
    const basePrice = parseMoney(item.basePrice);
    const additionsPrice = parseMoney(item.additionsPrice);
    const subtotal = parseMoney(item.subtotal ?? item.lineTotal ?? item.total);
    const additions = Array.isArray(item.additions) ? item.additions : [];
    const category = String(item.category ?? '').trim();
    const id = String(item.id ?? item.pizzaId ?? '').trim();
    return {
      ...(id ? { id } : {}),
      name,
      ...(category ? { category } : {}),
      qty,
      quantity: qty,
      ...(price !== null ? { price: round2(price) } : {}),
      ...(basePrice !== null ? { basePrice: round2(basePrice) } : {}),
      ...(additionsPrice !== null ? { additionsPrice: round2(additionsPrice) } : {}),
      additions,
      ...(subtotal !== null ? { subtotal: round2(subtotal), total: round2(subtotal) } : {}),
    };
  }).filter(Boolean);
}

function computeTotal(items, explicitTotal) {
  const totalFromPayload = parseMoney(explicitTotal);
  if (totalFromPayload !== null && totalFromPayload >= 0) return round2(totalFromPayload);
  return round2(items.reduce((sum, item) => {
    if (typeof item.subtotal === 'number') return sum + item.subtotal;
    if (typeof item.total === 'number') return sum + item.total;
    if (typeof item.price === 'number') return sum + (item.price * item.qty);
    if (typeof item.basePrice === 'number') {
      const additionsPrice = typeof item.additionsPrice === 'number' ? item.additionsPrice : 0;
      return sum + ((item.basePrice + additionsPrice) * item.qty);
    }
    return sum;
  }, 0));
}

function normalizeBillShape(rawBill, tableNumber) {
  const source = rawBill && typeof rawBill === 'object' ? rawBill : {};
  const items = normalizeItems(source.items);
  const derivedTotal = computeTotal(items, source.total);
  const originalTotal = parseMoney(source.originalTotal);
  const remainingTotal = parseMoney(source.remainingTotal);
  const normalizedOriginalTotal = Number.isFinite(originalTotal) && originalTotal >= 0 ? round2(originalTotal) : round2(derivedTotal);
  const normalizedRemainingTotal = Number.isFinite(remainingTotal) && remainingTotal >= 0 ? round2(remainingTotal) : round2(normalizedOriginalTotal);
  const paymentMode = String(source.paymentMode ?? '').trim().toLowerCase() === 'split' ? 'split' : 'full';
  const splitModeRaw = String(source.splitMode ?? '').trim().toLowerCase();
  const splitMode = paymentMode === 'split' && (splitModeRaw === 'split' || splitModeRaw === 'equal') ? 'split' : 'none';
  const totalShares = Math.max(1, Number.parseInt(source.totalShares, 10) || (paymentMode === 'split' ? 2 : 1));
  const paidShares = clamp(Number.parseInt(source.paidShares, 10) || 0, 0, totalShares);
  const remainingShares = clamp(Number.parseInt(source.remainingShares, 10) || Math.max(0, totalShares - paidShares), 0, totalShares);
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
  return { tableNumber, status: 'empty', items: [], total: 0, paymentStatus: 'unpaid', paymentMode: 'full', splitMode: 'none', totalShares: 1, paidShares: 0, remainingShares: 0, originalTotal: 0, remainingTotal: 0, updatedAt: null };
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return { url, key };
}

async function loadBill(tableNumber) {
  const { url, key } = getSupabaseConfig();
  const res = await fetch(`${url}/rest/v1/table_bills?table_number=eq.${tableNumber}&select=bill&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Supabase load error ${res.status}`);
  const rows = text ? JSON.parse(text) : [];
  return rows[0]?.bill || null;
}

async function saveBill(tableNumber, bill) {
  const { url, key } = getSupabaseConfig();
  const res = await fetch(`${url}/rest/v1/table_bills?on_conflict=table_number`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ table_number: tableNumber, bill, updated_at: new Date().toISOString() }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Supabase save error ${res.status}`);
  const rows = text ? JSON.parse(text) : [];
  return rows[0]?.bill || bill;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };

  const method = String(event.httpMethod || '').toUpperCase();
  const isWriteMethod = method === 'PUT' || method === 'POST';
  if (method !== 'GET' && !isWriteMethod) return respond(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });

  let payload = {};
  if (isWriteMethod) {
    try { payload = JSON.parse(event.body || '{}'); }
    catch (_) { return respond(400, { ok: false, error: 'INVALID_JSON' }); }
  }

  const tableNumber = getTableFromEvent(event, payload);
  if (!tableNumber) return respond(400, { ok: false, error: 'INVALID_TABLE' });

  try {
    if (isWriteMethod) {
      const bill = normalizeBillShape(payload.bill || payload, tableNumber);
      const savedBill = normalizeBillShape(await saveBill(tableNumber, bill), tableNumber);
      return respond(200, { ok: true, tableNumber, empty: savedBill.items.length === 0 && savedBill.total <= 0, bill: savedBill });
    }

    const stored = await loadBill(tableNumber);
    if (!stored) {
      return respond(200, { ok: true, tableNumber, empty: true, message: 'Nessun conto aperto per questo tavolo', bill: buildEmptyBill(tableNumber) });
    }

    const bill = normalizeBillShape(stored.bill || stored, tableNumber);
    const empty = bill.items.length === 0 && bill.total <= 0;
    const keepBillShape = empty && bill.paymentStatus === 'paid';
    return respond(200, { ok: true, tableNumber, empty, ...(empty ? { message: 'Nessun conto aperto per questo tavolo' } : {}), bill: empty ? (keepBillShape ? bill : buildEmptyBill(tableNumber)) : bill });
  } catch (error) {
    console.error('table-bill error', error);
    return respond(500, { ok: false, error: 'INTERNAL_ERROR', message: String(error.message || error).slice(0, 500) });
  }
};
