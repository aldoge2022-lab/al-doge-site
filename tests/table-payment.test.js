const test = require('node:test');
const assert = require('node:assert/strict');

function loadTablePaymentHandler({ stripeFactoryMock, fetchMock, initialStoreData = {} }) {
  const stripeModulePath = require.resolve('stripe');
  const fetchModulePath = require.resolve('node-fetch');
  const blobsModulePath = require.resolve('@netlify/blobs');
  const tablePaymentModulePath = require.resolve('../netlify/functions/table-payment');

  const previousStripeModule = require.cache[stripeModulePath];
  const previousFetchModule = require.cache[fetchModulePath];
  const previousBlobsModule = require.cache[blobsModulePath];
  const previousTablePaymentModule = require.cache[tablePaymentModulePath];

  const storeData = new Map(Object.entries(initialStoreData));

  require.cache[stripeModulePath] = {
    id: stripeModulePath,
    filename: stripeModulePath,
    loaded: true,
    exports: stripeFactoryMock,
  };

  require.cache[fetchModulePath] = {
    id: fetchModulePath,
    filename: fetchModulePath,
    loaded: true,
    exports: fetchMock,
  };

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

  delete require.cache[tablePaymentModulePath];
  const { handler } = require('../netlify/functions/table-payment');

  return {
    handler,
    storeData,
    restore() {
      delete require.cache[tablePaymentModulePath];

      if (previousTablePaymentModule) {
        require.cache[tablePaymentModulePath] = previousTablePaymentModule;
      }

      if (previousStripeModule) {
        require.cache[stripeModulePath] = previousStripeModule;
      } else {
        delete require.cache[stripeModulePath];
      }

      if (previousFetchModule) {
        require.cache[fetchModulePath] = previousFetchModule;
      } else {
        delete require.cache[fetchModulePath];
      }

      if (previousBlobsModule) {
        require.cache[blobsModulePath] = previousBlobsModule;
      } else {
        delete require.cache[blobsModulePath];
      }
    },
  };
}

test('table-payment creates a Stripe Checkout session for table flow', async () => {
  const previousSecretKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'sk_test_table';

  let capturedCreatePayload = null;
  const stripeFactoryMock = () => ({
    checkout: {
      sessions: {
        create: async (payload) => {
          capturedCreatePayload = payload;
          return { id: 'cs_table_123', url: 'https://checkout.stripe.com/c/pay/cs_table_123' };
        },
        retrieve: async () => {
          throw new Error('retrieve should not be called in create flow');
        },
      },
    },
  });

  const fetchMock = async () => ({ ok: true });

  const { handler, restore } = loadTablePaymentHandler({
    stripeFactoryMock,
    fetchMock,
    initialStoreData: {
      'table-2': {
        tableNumber: 2,
        items: [{ name: 'Pizza Margherita', qty: 1, price: 8.5 }],
        total: 8.5,
      },
    },
  });

  try {
    const response = await handler({
      httpMethod: 'POST',
      headers: {
        host: 'al-doge.it',
        'x-forwarded-proto': 'https',
      },
      body: JSON.stringify({
        tableNumber: 2,
        paymentMode: 'full',
      }),
    });

    assert.equal(response.statusCode, 200);
    assert.ok(capturedCreatePayload, 'Stripe checkout.sessions.create should be called');

    const body = JSON.parse(response.body);
    assert.equal(body.ok, true);
    assert.equal(body.checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_table_123');
    assert.equal(capturedCreatePayload.success_url.includes('payment=success'), true);
    assert.equal(capturedCreatePayload.cancel_url.includes('payment=cancelled'), true);
  } finally {
    restore();
    process.env.STRIPE_SECRET_KEY = previousSecretKey;
  }
});

test('table-payment confirms Stripe session and sends Telegram only once', async () => {
  const previousSecretKey = process.env.STRIPE_SECRET_KEY;
  const previousBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousChatId = process.env.TELEGRAM_CHAT_ID;
  process.env.STRIPE_SECRET_KEY = 'sk_test_table';
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = '123456';

  let telegramCalls = 0;
  const fetchMock = async () => {
    telegramCalls += 1;
    return { ok: true };
  };

  const stripeFactoryMock = () => ({
    checkout: {
      sessions: {
        create: async () => {
          throw new Error('create should not be called in confirm flow');
        },
        retrieve: async () => ({
          id: 'cs_table_paid_1',
          payment_status: 'paid',
          status: 'complete',
          amount_total: 1200,
          metadata: {
            tableNumber: '2',
            paymentMode: 'split',
            splitShares: '3',
            splitShareIndex: '1',
            billTotal: '36.00',
            payableAmount: '12.00',
          },
        }),
      },
    },
  });

  const { handler, restore } = loadTablePaymentHandler({
    stripeFactoryMock,
    fetchMock,
    initialStoreData: {
      'table-2': {
        tableNumber: 2,
        items: [{ name: 'Antipasto', qty: 1, price: 36 }],
        total: 36,
      },
    },
  });

  try {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        action: 'confirm',
        sessionId: 'cs_table_paid_1',
      }),
    };

    const firstResponse = await handler(event);
    assert.equal(firstResponse.statusCode, 200);
    const firstBody = JSON.parse(firstResponse.body);
    assert.equal(firstBody.ok, true);
    assert.equal(firstBody.paid, true);
    assert.equal(firstBody.alreadyConfirmed, false);

    const secondResponse = await handler(event);
    assert.equal(secondResponse.statusCode, 200);
    const secondBody = JSON.parse(secondResponse.body);
    assert.equal(secondBody.ok, true);
    assert.equal(secondBody.paid, true);
    assert.equal(secondBody.alreadyConfirmed, true);

    assert.equal(telegramCalls, 1);
  } finally {
    restore();
    process.env.STRIPE_SECRET_KEY = previousSecretKey;
    process.env.TELEGRAM_BOT_TOKEN = previousBotToken;
    process.env.TELEGRAM_CHAT_ID = previousChatId;
  }
});

test('table-payment confirm in split mode updates bill as partial and does not fail without Telegram credentials', async () => {
  const previousSecretKey = process.env.STRIPE_SECRET_KEY;
  const previousBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousChatId = process.env.TELEGRAM_CHAT_ID;
  process.env.STRIPE_SECRET_KEY = 'sk_test_table';
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;

  const fetchMock = async () => ({ ok: true });

  const stripeFactoryMock = () => ({
    checkout: {
      sessions: {
        create: async () => {
          throw new Error('create should not be called in confirm flow');
        },
        retrieve: async () => ({
          id: 'cs_table_paid_split_1',
          payment_status: 'paid',
          status: 'complete',
          amount_total: 1200,
          metadata: {
            tableNumber: '2',
            paymentMode: 'split',
            splitShares: '3',
            splitShareIndex: '1',
            billTotal: '36.00',
            payableAmount: '12.00',
            originalTotal: '36.00',
            paidShares: '0',
            remainingShares: '3',
          },
        }),
      },
    },
  });

  const { handler, restore, storeData } = loadTablePaymentHandler({
    stripeFactoryMock,
    fetchMock,
    initialStoreData: {
      'table-2': {
        tableNumber: 2,
        items: [{ name: 'Antipasto', qty: 1, price: 36 }],
        total: 36,
        paymentMode: 'split',
        splitMode: 'equal',
        totalShares: 3,
        paidShares: 0,
        remainingShares: 3,
        paymentStatus: 'unpaid',
        originalTotal: 36,
        remainingTotal: 36,
      },
    },
  });

  try {
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        action: 'confirm',
        sessionId: 'cs_table_paid_split_1',
      }),
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.ok, true);
    assert.equal(body.paid, true);
    assert.equal(body.alreadyConfirmed, false);

    const updatedBill = storeData.get('table-2');
    assert.equal(updatedBill.paymentStatus, 'partial');
    assert.equal(updatedBill.splitMode, 'split');
    assert.equal(updatedBill.paidShares, 1);
    assert.equal(updatedBill.remainingShares, 2);
    assert.equal(updatedBill.originalTotal, 36);
    assert.equal(updatedBill.remainingTotal, 24);
    assert.equal(updatedBill.total, 24);
  } finally {
    restore();
    process.env.STRIPE_SECRET_KEY = previousSecretKey;
    process.env.TELEGRAM_BOT_TOKEN = previousBotToken;
    process.env.TELEGRAM_CHAT_ID = previousChatId;
  }
});

test('table-payment create in split continuation charges the real remaining quota (not half again)', async () => {
  const previousSecretKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'sk_test_table';

  let capturedCreatePayload = null;
  const stripeFactoryMock = () => ({
    checkout: {
      sessions: {
        create: async (payload) => {
          capturedCreatePayload = payload;
          return { id: 'cs_table_cont_1', url: 'https://checkout.stripe.com/c/pay/cs_table_cont_1' };
        },
        retrieve: async () => {
          throw new Error('retrieve should not be called in create flow');
        },
      },
    },
  });
  const fetchMock = async () => ({ ok: true });

  const { handler, restore } = loadTablePaymentHandler({
    stripeFactoryMock,
    fetchMock,
    initialStoreData: {
      'table-2': {
        tableNumber: 2,
        items: [{ name: 'Antipasto', qty: 1, price: 36 }],
        total: 18,
        paymentMode: 'split',
        splitMode: 'split',
        totalShares: 2,
        paidShares: 1,
        remainingShares: 1,
        paymentStatus: 'partial',
        originalTotal: 36,
        remainingTotal: 18,
      },
    },
  });

  try {
    const response = await handler({
      httpMethod: 'POST',
      headers: {
        host: 'al-doge.it',
        'x-forwarded-proto': 'https',
      },
      body: JSON.stringify({
        tableNumber: 2,
        paymentMode: 'split',
        splitShares: 2,
        splitShareIndex: 1,
      }),
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.ok, true);
    assert.equal(body.payableAmount, 18);
    assert.equal(body.splitShares, 2);
    assert.equal(capturedCreatePayload.metadata.remainingShares, '1');
    assert.equal(capturedCreatePayload.line_items[0].price_data.unit_amount, 1800);
  } finally {
    restore();
    process.env.STRIPE_SECRET_KEY = previousSecretKey;
  }
});

test('table-payment confirm final split quota closes and clears table state', async () => {
  const previousSecretKey = process.env.STRIPE_SECRET_KEY;
  const previousBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousChatId = process.env.TELEGRAM_CHAT_ID;
  process.env.STRIPE_SECRET_KEY = 'sk_test_table';
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;

  const fetchMock = async () => ({ ok: true });
  const stripeFactoryMock = () => ({
    checkout: {
      sessions: {
        create: async () => {
          throw new Error('create should not be called in confirm flow');
        },
        retrieve: async () => ({
          id: 'cs_table_paid_split_2',
          payment_status: 'paid',
          status: 'complete',
          amount_total: 2400,
          metadata: {
            tableNumber: '2',
            paymentMode: 'split',
            splitShares: '2',
            splitShareIndex: '2',
            billTotal: '48.00',
            payableAmount: '24.00',
            originalTotal: '48.00',
            paidShares: '1',
            remainingShares: '1',
          },
        }),
      },
    },
  });

  const { handler, restore, storeData } = loadTablePaymentHandler({
    stripeFactoryMock,
    fetchMock,
    initialStoreData: {
      'table-2': {
        tableNumber: 2,
        items: [{ name: 'Antipasto', qty: 1, price: 48 }],
        total: 24,
        paymentMode: 'split',
        splitMode: 'split',
        totalShares: 2,
        paidShares: 1,
        remainingShares: 1,
        paymentStatus: 'partial',
        originalTotal: 48,
        remainingTotal: 24,
      },
    },
  });

  try {
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        action: 'confirm',
        sessionId: 'cs_table_paid_split_2',
      }),
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.ok, true);
    assert.equal(body.paid, true);

    const updatedBill = storeData.get('table-2');
    assert.equal(updatedBill.paymentStatus, 'paid');
    assert.equal(updatedBill.remainingShares, 0);
    assert.equal(updatedBill.remainingTotal, 0);
    assert.equal(updatedBill.total, 0);
    assert.deepEqual(updatedBill.items, []);
    assert.equal(updatedBill.paymentCode, '');
  } finally {
    restore();
    process.env.STRIPE_SECRET_KEY = previousSecretKey;
    process.env.TELEGRAM_BOT_TOKEN = previousBotToken;
    process.env.TELEGRAM_CHAT_ID = previousChatId;
  }
});
