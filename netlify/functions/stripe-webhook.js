const crypto = require('crypto');

const WEBHOOK_TIMESTAMP_TOLERANCE = 5 * 60;
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json'
};

function getRawBody(event) {
  if (!event.body) {
    return '';
  }
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, 'base64').toString('utf8');
  }
  return event.body;
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function verifyStripeSignature(payload, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const elements = signatureHeader.split(',').map((item) => item.trim());
  const timestamp = elements.find((item) => item.startsWith('t='));
  const signatures = elements.filter((item) => item.startsWith('v1='));

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const timestampValue = timestamp.split('=')[1];
  const signedPayload = `${timestampValue}.${payload}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  const validSignature = signatures.some((sig) => {
    const signatureValue = sig.split('=')[1];
    return signatureValue && safeEqual(signatureValue, expected);
  });

  if (!validSignature) {
    return false;
  }

  const tolerance = WEBHOOK_TIMESTAMP_TOLERANCE; // Stripe recommends a 5-minute tolerance window for webhooks (configurable).
  const timestampNumber = Number(timestampValue);
  if (!Number.isFinite(timestampNumber)) {
    return false;
  }
  const currentTimestamp = Math.floor(Date.now() / 1000);
  return Math.abs(currentTimestamp - timestampNumber) <= tolerance;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchLineItems(sessionId) {
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${sessionId}/line_items?limit=100&expand[]=data.price.product`,
    {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }
    }
  );

  if (!response.ok) {
    throw new Error(`Errore nel recupero line items per session ${sessionId}: HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.data || [];
}

async function sendTelegramMessage(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('Telegram non configurato: notifica saltata.');
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    })
  });

  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Telegram API error: ${result.description}`);
  }
}

function formatOrderMessage({ session, lineItems }) {
  const metadata = session.metadata || {};
  const orderId = escapeHtml(metadata.order_id || session.client_reference_id || session.id);
  const customerName = escapeHtml(metadata.customer_name || session.customer_details?.name || 'Cliente');
  const customerPhone = escapeHtml(metadata.customer_phone || 'N/D');
  const customerNotes = escapeHtml(metadata.customer_notes || '');

  let message = `🍕 <b>NUOVO ORDINE #${orderId}</b>\n\n`;
  message += `👤 Nome: ${customerName}\n`;
  message += `📞 Tel: ${customerPhone}\n\n`;
  message += `📦 <b>ORDINE:</b>\n`;

  lineItems.forEach((item) => {
    const name = escapeHtml(item.price?.product?.name || item.description || 'Articolo');
    const quantity = item.quantity || 1;
    const total = (item.amount_total || 0) / 100;
    message += `- ${quantity}x ${name} (€${total.toFixed(2)})\n`;
  });

  const totalAmount = session.amount_total ? session.amount_total / 100 : 0;
  message += `\n💰 Totale: €${totalAmount.toFixed(2)}\n`;
  message += `✅ PAGATO\n`;

  if (customerNotes) {
    message += `\n📝 Note: ${customerNotes}`;
  }

  return message;
}

function formatTableMessage({ session }) {
  const metadata = session.metadata || {};
  const tableNumber = escapeHtml(metadata.table_number || 'N/D');
  const totalAmount = session.amount_total ? session.amount_total / 100 : 0;

  let message = `🍕 <b>PAGAMENTO TAVOLO #${tableNumber}</b>\n\n`;
  message += `💰 Importo: €${totalAmount.toFixed(2)}\n`;
  message += `✅ PAGATO\n\n`;
  message += `⏰ ${new Date().toLocaleString('it-IT')}`;

  return message;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: DEFAULT_HEADERS, body: JSON.stringify({ error: 'Metodo non consentito' }) };
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) {
    return { statusCode: 500, headers: DEFAULT_HEADERS, body: JSON.stringify({ error: 'Webhook Stripe non configurato' }) };
  }

  const payload = getRawBody(event);
  const signature = event.headers['stripe-signature'];

  if (!verifyStripeSignature(payload, signature, process.env.STRIPE_WEBHOOK_SECRET)) {
    return { statusCode: 400, headers: DEFAULT_HEADERS, body: JSON.stringify({ error: 'Firma Stripe non valida' }) };
  }

  let stripeEvent;
  try {
    stripeEvent = JSON.parse(payload);
  } catch (error) {
    return { statusCode: 400, headers: DEFAULT_HEADERS, body: JSON.stringify({ error: 'Payload non valido' }) };
  }

  const handledEvents = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];
  if (!handledEvents.includes(stripeEvent.type)) {
    return { statusCode: 200, headers: DEFAULT_HEADERS, body: JSON.stringify({ received: true }) };
  }

  const session = stripeEvent.data?.object;
  if (!session || session.payment_status !== 'paid') {
    return { statusCode: 200, headers: DEFAULT_HEADERS, body: JSON.stringify({ received: true }) };
  }

  try {
    const orderType = session.metadata?.order_type || 'order';
    const lineItems = orderType === 'order' ? await fetchLineItems(session.id) : [];
    const message = orderType === 'table_payment'
      ? formatTableMessage({ session })
      : formatOrderMessage({ session, lineItems });

    await sendTelegramMessage(message);

    return { statusCode: 200, headers: DEFAULT_HEADERS, body: JSON.stringify({ received: true }) };
  } catch (error) {
    console.error('Errore webhook Stripe:', error);
    return { statusCode: 500, headers: DEFAULT_HEADERS, body: JSON.stringify({ error: error.message }) };
  }
};
