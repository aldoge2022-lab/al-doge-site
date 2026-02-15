function buildSuccessUrl(baseUrl) {
  const url = new URL('/success.html', baseUrl);
  url.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
  return url.toString();
}

function buildCancelUrl(baseUrl) {
  return new URL('/cancel.html', baseUrl).toString();
}

function getBaseUrl(event) {
  const siteUrl = process.env.SITE_URL;
  if (siteUrl) return siteUrl;
  const origin = event.headers.origin || event.headers.referer;
  if (origin) return origin.replace(/\/$/, '');
  const protocol = event.headers['x-forwarded-proto'] || 'https';
  const host = event.headers.host;
  return `${protocol}://${host}`;
}

function sanitizeText(text, maxLength = 120) {
  return String(text || '').replace(/[<>]/g, '').trim().slice(0, maxLength);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Metodo non consentito.' })
    };
  }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Stripe non configurato.' })
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const prodotti = Array.isArray(payload.prodotti) ? payload.prodotti : [];

    if (prodotti.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Carrello vuoto.' })
      };
    }

    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('success_url', buildSuccessUrl(getBaseUrl(event)));
    params.append('cancel_url', buildCancelUrl(getBaseUrl(event)));

    const validItems = prodotti
      .map((item) => ({
        nome: sanitizeText(item.nome),
        prezzo: Number(item.prezzo || 0),
        quantita: Math.max(1, Number(item.quantita || 1))
      }))
      .filter((item) => item.nome && item.prezzo > 0);

    if (validItems.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Prodotti non validi.' })
      };
    }

    validItems.forEach((item, index) => {
      const name = sanitizeText(item.nome);
      const unitAmount = Math.round(Number(item.prezzo || 0) * 100);
      const quantity = Math.max(1, Number(item.quantita || 1));

      params.append(`line_items[${index}][price_data][currency]`, 'eur');
      params.append(`line_items[${index}][price_data][product_data][name]`, name);
      params.append(`line_items[${index}][price_data][unit_amount]`, String(unitAmount));
      params.append(`line_items[${index}][quantity]`, String(quantity));
    });

    params.append('metadata[cliente]', sanitizeText(payload.nome, 60));
    params.append('metadata[telefono]', sanitizeText(payload.telefono, 20));
    params.append('metadata[orario]', sanitizeText(payload.orario, 10));
    params.append('metadata[note]', sanitizeText(payload.note, 200));

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${STRIPE_SECRET_KEY}:`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    const data = await response.json();
    if (!response.ok || !data.url) {
      throw new Error(data.error?.message || 'Errore Stripe.');
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: data.url })
    };
  } catch (error) {
    console.error('Errore Stripe:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Errore nella creazione della sessione.' })
    };
  }
};
