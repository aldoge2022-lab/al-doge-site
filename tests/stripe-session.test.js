const test = require("node:test");
const assert = require("node:assert/strict");

function loadStripeSessionHandler(stripeFactoryMock) {
  const stripeModulePath = require.resolve("stripe");
  const sessionModulePath = require.resolve("../netlify/functions/stripe-session");
  const previousStripeModule = require.cache[stripeModulePath];
  const previousSessionModule = require.cache[sessionModulePath];

  require.cache[stripeModulePath] = {
    id: stripeModulePath,
    filename: stripeModulePath,
    loaded: true,
    exports: stripeFactoryMock,
  };
  delete require.cache[sessionModulePath];

  const { handler } = require("../netlify/functions/stripe-session");

  return {
    handler,
    restore() {
      delete require.cache[sessionModulePath];
      if (previousSessionModule) {
        require.cache[sessionModulePath] = previousSessionModule;
      }

      if (previousStripeModule) {
        require.cache[stripeModulePath] = previousStripeModule;
      } else {
        delete require.cache[stripeModulePath];
      }
    },
  };
}

test("stripe-session returns session id and publishable key for checkout", async () => {
  const previousSecretKey = process.env.STRIPE_SECRET_KEY;
  const previousPublicKey = process.env.STRIPE_PUBLIC_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_PUBLIC_KEY = "pk_test_123";

  let capturedCreatePayload = null;
  const stripeFactoryMock = () => ({
    checkout: {
      sessions: {
        create: async (payload) => {
          capturedCreatePayload = payload;
          return { id: "cs_test_123" };
        },
      },
    },
  });

  const { handler, restore } = loadStripeSessionHandler(stripeFactoryMock);

  try {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        name: "Mario Rossi",
        phone: "3331234567",
        mode: "consegna",
        address: "Via Roma 10",
        date: "2026-03-07",
        time: "20:00",
        notes: "",
        items: [{ name: "Pizza Margherita", qty: 2, price: 8 }],
      }),
    });

    assert.equal(response.statusCode, 200);
    assert.ok(capturedCreatePayload);

    const body = JSON.parse(response.body);
    assert.equal(body.sessionId, "cs_test_123");
    assert.equal(body.publishableKey, "pk_test_123");
  } finally {
    restore();
    process.env.STRIPE_SECRET_KEY = previousSecretKey;
    process.env.STRIPE_PUBLIC_KEY = previousPublicKey;
  }
});

test("stripe-session returns 500 when STRIPE_SECRET_KEY is missing", async () => {
  const previousSecretKey = process.env.STRIPE_SECRET_KEY;
  const previousPublicKey = process.env.STRIPE_PUBLIC_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_PUBLIC_KEY = "pk_test_123";

  let stripeFactoryCalls = 0;
  const stripeFactoryMock = () => {
    stripeFactoryCalls += 1;
    return {
      checkout: {
        sessions: {
          create: async () => ({ id: "cs_test_should_not_happen" }),
        },
      },
    };
  };

  const { handler, restore } = loadStripeSessionHandler(stripeFactoryMock);

  try {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        items: [{ name: "Pizza Margherita", qty: 1, price: 8 }],
      }),
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.body, "Stripe session error");
    assert.equal(stripeFactoryCalls, 0);
  } finally {
    restore();
    process.env.STRIPE_SECRET_KEY = previousSecretKey;
    process.env.STRIPE_PUBLIC_KEY = previousPublicKey;
  }
});
