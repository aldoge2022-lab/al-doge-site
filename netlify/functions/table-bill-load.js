const { getStore } = require('@netlify/blobs');
const {
  buildBill,
  getDefaultBill,
  getTableStorageKey,
  normalizeTableId,
} = require('./lib/table-bill-utils');

let storeInstance;

function getBillStore() {
  if (storeInstance) {
    return storeInstance;
  }

  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;

  const options = { name: 'al-doge-table-bills', consistency: 'strong' };
  if (siteID && token) {
    options.siteID = siteID;
    options.token = token;
  }

  storeInstance = getStore(options);
  return storeInstance;
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function getTableId(event) {
  const fromQuery = event.queryStringParameters?.tableId ?? event.queryStringParameters?.table;
  if (fromQuery) {
    return normalizeTableId(fromQuery);
  }

  if (!event.body) {
    throw new Error('ID tavolo mancante');
  }

  const parsed = JSON.parse(event.body);
  return normalizeTableId(parsed.tableId ?? parsed.tableNumber ?? parsed.table);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return response(405, { ok: false, error: 'Metodo non consentito' });
  }

  try {
    const tableId = getTableId(event);
    const storageKey = getTableStorageKey(tableId);

    const store = getBillStore();
    const storedBill = await store.get(storageKey, { type: 'json' });
    if (!storedBill) {
      return response(200, {
        ok: true,
        exists: false,
        tableId,
        storageKey,
        bill: getDefaultBill(tableId),
      });
    }

    const bill = buildBill({
      tableId,
      covers: storedBill.covers,
      items: storedBill.items,
    });

    if (JSON.stringify(storedBill) !== JSON.stringify(bill)) {
      await store.setJSON(storageKey, bill);
    }

    return response(200, {
      ok: true,
      exists: true,
      tableId,
      storageKey,
      bill,
    });
  } catch (error) {
    console.error('Errore load conto tavolo:', error);
    return response(400, {
      ok: false,
      error: error?.message || 'Caricamento conto non riuscito',
    });
  }
};
