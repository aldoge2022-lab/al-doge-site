const Stripe = require("stripe");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    const publishableKey = process.env.STRIPE_PUBLIC_KEY;

    if (!secretKey) {
      throw new Error("Missing STRIPE_SECRET_KEY");
    }

    if (!publishableKey) {
      throw new Error("Missing STRIPE_PUBLIC_KEY");
    }

    const stripe = Stripe(secretKey);
    const data = JSON.parse(event.body);

    const line_items = data.items.map((item) => ({
      price_data: {
        currency: "eur",
        product_data: {
          name: item.name,
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.qty,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items,
      success_url: "https://al-doge.it/success.html",
      cancel_url: "https://al-doge.it/checkout.html",
      metadata: {
        name: data.name,
        phone: data.phone,
        mode: data.mode,
        address: data.address || "",
        date: data.date,
        time: data.time,
        notes: data.notes || "",
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        sessionId: session.id,
        publishableKey,
      }),
    };
  } catch (err) {
    console.error("Stripe session error", {
      message: err?.message,
      code: err?.code,
      type: err?.type,
      requestId: err?.requestId,
      hasSecretKey: Boolean(process.env.STRIPE_SECRET_KEY),
      hasPublicKey: Boolean(process.env.STRIPE_PUBLIC_KEY),
    });
    return {
      statusCode: 500,
      body: "Stripe session error",
    };
  }
};
