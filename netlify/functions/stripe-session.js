const Stripe = require("stripe");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    if (!process.env.STRIPE_PUBLIC_KEY) {
      throw new Error("Missing STRIPE_PUBLIC_KEY");
    }

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
        publishableKey: process.env.STRIPE_PUBLIC_KEY,
      }),
    };
  } catch (err) {
    console.error("Stripe error:", err);
    return {
      statusCode: 500,
      body: "Stripe session error",
    };
  }
};
