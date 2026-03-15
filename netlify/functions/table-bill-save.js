const { getStore } = require('@netlify/blobs');
const { buildBill, getTableStorageKey } = require('./lib/table-bill-utils');

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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return response(405, { ok: false, error: 'Metodo non consentito' });
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const rawBill = payload.bill && typeof payload.bill === 'object'
      ? { ...payload.bill, tableId: payload.tableId ?? payload.bill.tableId ?? payload.tableNumber }
      : payload;

    const bill = buildBill(rawBill);
    const storageKey = getTableStorageKey(bill.tableId);

    const store = getBillStore();
    await store.setJSON(storageKey, bill);

    return response(200, {
      ok: true,
      tableId: bill.tableId,
      storageKey,
      bill,
    });
  } catch (error) {
    console.error('Errore save conto tavolo:', error);
    return response(400, {
      ok: false,
      error: error?.message || 'Salvataggio conto non riuscito',
    });
  }
};
