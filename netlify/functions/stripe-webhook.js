const crypto = require('crypto');

function getRawBody(event) {
  if (!event.body) return '';
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
}

function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const elements = signatureHeader.split(',').reduce((acc, item) => {
    const [key, value] = item.split('=');
    acc[key] = value;
    return acc;
  }, {});

  const timestamp = elements.t;
  const signature = elements.v1;
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function formatCurrency(value) {
  return (Number(value || 0) / 100).toFixed(2);
}

function sanitizeText(value, maxLength = 120) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, maxLength);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Metodo non consentito.' })
    };
  }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  const rawBody = getRawBody(event);
  const signatureHeader = event.headers['stripe-signature'];

  if (!verifySignature(rawBody, signatureHeader, STRIPE_WEBHOOK_SECRET)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Firma Stripe non valida.' })
    };
  }

  let stripeEvent;
  try {
    stripeEvent = JSON.parse(rawBody);
  } catch (error) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Payload non valido.' })
    };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    try {
      const session = stripeEvent.data.object;
      const sessionId = session.id;
      const customerName = sanitizeText(session.metadata?.cliente || 'Cliente');
      const phone = sanitizeText(session.metadata?.telefono || '');
      const pickupTime = sanitizeText(session.metadata?.orario || '');
      const notes = sanitizeText(session.metadata?.note || '', 200);

      if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID && STRIPE_SECRET_KEY) {
        const sessionResponse = await fetch(
          `https://api.stripe.com/v1/checkout/sessions/${sessionId}?expand[]=line_items`,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${STRIPE_SECRET_KEY}:`).toString('base64')}`
            }
          }
        );
        const sessionData = await sessionResponse.json();
        const lineItems = sessionData.line_items?.data || [];

        const messageLines = [
          '✅ PAGAMENTO STRIPE CONFERMATO',
          '',
          `Cliente: ${customerName}`,
          phone ? `Telefono: ${phone}` : null,
          pickupTime ? `Orario ritiro: ${pickupTime}` : null,
          '',
          'Ordine:'
        ].filter(Boolean);

        lineItems.forEach((item) => {
          messageLines.push(`- ${item.quantity}x ${item.description}`);
        });

        messageLines.push('');
        messageLines.push(`Totale pagato: €${formatCurrency(session.amount_total)}`);

        if (notes) {
          messageLines.push(`Note: ${notes}`);
        }

        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: messageLines.join('\n')
          })
        });
      }
    } catch (error) {
      console.error('Errore webhook Stripe:', error);
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ received: true })
  };
};
