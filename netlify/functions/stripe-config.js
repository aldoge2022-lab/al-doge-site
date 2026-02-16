const DEFAULT_HEADERS = {
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
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

exports.handler = async (event) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Metodo non consentito' })
    };
  }

  const publicKey = process.env.STRIPE_PUBLIC_KEY;
  if (!publicKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Stripe non configurato' })
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ publicKey })
  };
};
