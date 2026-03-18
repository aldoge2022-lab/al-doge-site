const test = require('node:test');
const assert = require('node:assert/strict');

function loadTableBillHandler({ initialStoreData = {} }) {
  const blobsModulePath = require.resolve('@netlify/blobs');
  const tableBillModulePath = require.resolve('../netlify/functions/table-bill');

  const previousBlobsModule = require.cache[blobsModulePath];
  const previousTableBillModule = require.cache[tableBillModulePath];

  const storeData = new Map(Object.entries(initialStoreData));

  require.cache[blobsModulePath] = {
    id: blobsModulePath,
    filename: blobsModulePath,
    loaded: true,
    exports: {
      connectLambda: () => {},
      getStore: () => ({
        async get(key) {
          return storeData.has(key) ? storeData.get(key) : null;
        },
        async setJSON(key, value) {
          storeData.set(key, value);
        },
      }),
    },
  };

  delete require.cache[tableBillModulePath];
  const { handler } = require('../netlify/functions/table-bill');

  return {
    handler,
    restore() {
      delete require.cache[tableBillModulePath];
      if (previousTableBillModule) {
        require.cache[tableBillModulePath] = previousTableBillModule;
      }
      if (previousBlobsModule) {
        require.cache[blobsModulePath] = previousBlobsModule;
      } else {
        delete require.cache[blobsModulePath];
      }
    },
  };
}

test('table-bill normalizes split metadata and always returns valid JSON shape', async () => {
  const { handler, restore } = loadTableBillHandler({
    initialStoreData: {
      'table-2': {
        tableNumber: 2,
        items: [{ name: 'Pizza', qty: '1', price: '12.00' }],
        total: null,
        paymentMode: 'split',
        splitMode: 'split',
        totalShares: '3',
        paidShares: '1',
        remainingShares: undefined,
        paymentStatus: null,
        originalTotal: '36.00',
        remainingTotal: '24.00',
      },
    },
  });

  try {
    const response = await handler({
      httpMethod: 'GET',
      queryStringParameters: { table: '2' },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.ok, true);
    assert.equal(body.empty, false);
    assert.equal(body.bill.paymentMode, 'split');
    assert.equal(body.bill.splitMode, 'split');
    assert.equal(body.bill.paymentStatus, 'partial');
    assert.equal(body.bill.totalShares, 3);
    assert.equal(body.bill.paidShares, 1);
    assert.equal(body.bill.remainingShares, 2);
    assert.equal(body.bill.originalTotal, 36);
    assert.equal(body.bill.remainingTotal, 24);
    assert.equal(body.bill.total, 24);
  } finally {
    restore();
  }
});

test('table-bill preserves explicit paid split state when table is already cleared', async () => {
  const { handler, restore } = loadTableBillHandler({
    initialStoreData: {
      'table-2': {
        tableNumber: '2',
        items: [],
        total: '0.00',
        paymentMode: 'split',
        splitMode: 'equal',
        totalShares: '2',
        paidShares: '2',
        remainingShares: '0',
        paymentStatus: 'paid',
        originalTotal: '30.00',
        remainingTotal: '0.00',
      },
    },
  });

  try {
    const response = await handler({
      httpMethod: 'GET',
      queryStringParameters: { table: '2' },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.ok, true);
    assert.equal(body.empty, true);
    assert.equal(body.bill.paymentStatus, 'paid');
    assert.equal(body.bill.paymentMode, 'split');
    assert.equal(body.bill.splitMode, 'split');
    assert.equal(body.bill.remainingShares, 0);
    assert.equal(body.bill.remainingTotal, 0);
  } finally {
    restore();
  }
});
