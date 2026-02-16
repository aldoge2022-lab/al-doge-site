const crypto = require('crypto');

const DEFAULT_CURRENCY = 'eur';
const MAX_LINE_ITEMS = 50;
const MAX_TABLE_NUMBER = 10;

const DEFAULT_HEADERS = {
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function getCorsHeaders(event) {
  const siteUrl = process.env.SITE_URL || process.env.URL;
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const origin = siteUrl || requestOrigin || '*';

  return {
    ...DEFAULT_HEADERS,
    'Access-Control-Allow-Origin': origin,
    'Content-Type': 'application/json'
  };
}

function parseRequestBody(event) {
  if (!event.body) {
    return {};
  }

  try {
    return JSON.parse(event.body);
  } catch (error) {
    return null;
  }
}

function sanitizeText(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback;
  }
  return value.trim().slice(0, 200);
}

function toCents(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.round(numeric * 100);
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Il carrello è vuoto');
  }

  return items.slice(0, MAX_LINE_ITEMS).map((item, index) => {
    const name = sanitizeText(item.name || item.nome, `Articolo ${index + 1}`);
    const quantity = Number(item.quantity || item.quantita);
    const unitAmount = toCents(item.price || item.prezzo);

    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error('Quantità non valida');
    }

    // Stripe platform minimum for EUR payments is €0.50 per unit.
    if (!Number.isInteger(unitAmount)) {
      throw new Error('Prezzo non valido');
    }

    if (unitAmount < 50) {
      throw new Error('Il prezzo deve essere almeno €0.50');
    }

    const ingredients = Array.isArray(item.ingredients)
      ? item.ingredients
      : Array.isArray(item.ingredienti)
        ? item.ingredienti
        : [];

    const description = ingredients.length > 0
      ? `Ingredienti: ${ingredients.join(', ').slice(0, 500)}`
      : undefined;

    return {
      name,
      description,
      quantity,
      unitAmount
    };
  });
}

function generateOrderId(prefix) {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${crypto.randomBytes(8).toString('hex')}`;
}

function buildStripeParams({ lineItems, successUrl, cancelUrl, metadata, clientReferenceId }) {
  const params = new URLSearchParams();

  params.append('mode', 'payment');
  params.append('success_url', successUrl);
  params.append('cancel_url', cancelUrl);
  params.append('locale', 'it');

  lineItems.forEach((item, index) => {
    params.append(`line_items[${index}][price_data][currency]`, DEFAULT_CURRENCY);
    params.append(`line_items[${index}][price_data][product_data][name]`, item.name);
    if (item.description) {
      params.append(`line_items[${index}][price_data][product_data][description]`, item.description);
    }
    params.append(`line_items[${index}][price_data][unit_amount]`, item.unitAmount.toString());
    params.append(`line_items[${index}][quantity]`, item.quantity.toString());
  });

  if (clientReferenceId) {
    params.append('client_reference_id', clientReferenceId);
  }

  Object.entries(metadata || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(`metadata[${key}]`, String(value).slice(0, 500));
    }
  });

  return params;
}

function buildBaseUrl(event) {
  const siteUrl = process.env.SITE_URL || process.env.URL;
  if (siteUrl) {
    return siteUrl.replace(/\/$/, '');
  }

  const proto = event.headers['x-forwarded-proto'] || 'https';
  const host = event.headers['x-forwarded-host'] || event.headers.host;
  return `${proto}://${host}`;
}

exports.handler = async (event) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Metodo non consentito' })
    };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Stripe non configurato' })
    };
  }

  const payload = parseRequestBody(event);
  if (!payload) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Payload non valido' })
    };
  }

  try {
    const orderType = payload.type === 'table_payment' ? 'table_payment' : 'order';
    const baseUrl = buildBaseUrl(event);
    const orderId = generateOrderId(orderType === 'table_payment' ? 'TBL' : 'ORD');

    let lineItems = [];
    let successUrl = `${baseUrl}/checkout.html?success=1&session_id={CHECKOUT_SESSION_ID}`;
    let cancelUrl = `${baseUrl}/checkout.html?canceled=1`;
    const metadata = { order_type: orderType, order_id: orderId };

    if (orderType === 'table_payment') {
      const tableNumber = Number(payload.tableNumber);
      const amountCents = toCents(payload.amount);

      if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > MAX_TABLE_NUMBER) {
        throw new Error('Numero tavolo non valido');
      }

      if (!Number.isInteger(amountCents) || amountCents < 100) {
        throw new Error('Importo non valido');
      }

      metadata.table_number = tableNumber;
      metadata.amount = (amountCents / 100).toFixed(2);

      lineItems = [
        {
          name: `Pagamento Tavolo #${tableNumber}`,
          description: 'Pagamento al tavolo AL DOGE',
          quantity: 1,
          unitAmount: amountCents
        }
      ];

      successUrl = `${baseUrl}/pay.html?table=${tableNumber}&success=1&session_id={CHECKOUT_SESSION_ID}`;
      cancelUrl = `${baseUrl}/pay.html?table=${tableNumber}&canceled=1`;
    } else {
      lineItems = normalizeItems(payload.items);

      const customer = payload.customer || {};
      metadata.customer_name = sanitizeText(customer.name);
      metadata.customer_phone = sanitizeText(customer.phone);
      metadata.customer_notes = sanitizeText(customer.notes);
    }

    const params = buildStripeParams({
      lineItems,
      successUrl,
      cancelUrl,
      metadata,
      clientReferenceId: orderId
    });

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data?.error?.message || 'Errore Stripe';
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: errorMessage })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ sessionId: data.id })
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
