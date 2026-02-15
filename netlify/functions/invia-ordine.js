const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitStore = new Map();

function getClientIp(event) {
  const forwarded = event.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return event.headers['x-nf-client-connection-ip'] || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const requests = rateLimitStore.get(ip) || [];
  const recent = requests.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  rateLimitStore.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

function sanitizeText(text, maxLength = 200) {
  if (!text) return '';
  return String(text)
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function formatCurrency(value) {
  return Number(value || 0).toFixed(2);
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
      body: JSON.stringify({ success: false, error: 'Metodo non consentito.' })
    };
  }

  const clientIp = getClientIp(event);
  if (isRateLimited(clientIp)) {
    return {
      statusCode: 429,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Troppe richieste. Riprova tra qualche minuto.' })
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const prodotti = Array.isArray(payload.prodotti) ? payload.prodotti : [];

    const nome = sanitizeText(payload.nome, 60);
    const telefono = sanitizeText(payload.telefono, 20);
    const orario = sanitizeText(payload.orario, 10);
    const note = sanitizeText(payload.note, 200);
    const pagamento = sanitizeText(payload.pagamento, 20);

    if (!nome || !telefono || !orario || prodotti.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Dati ordine incompleti.' })
      };
    }

    const items = prodotti
      .map((item) => ({
        nome: sanitizeText(item.nome, 80),
        quantita: Number(item.quantita || 0),
        prezzo: Number(item.prezzo || 0)
      }))
      .filter((item) => item.nome && item.quantita > 0 && item.prezzo >= 0);

    if (items.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Prodotti non validi.' })
      };
    }

    const total = items.reduce((sum, item) => sum + item.prezzo * item.quantita, 0);
    const orderId = Date.now().toString();

    const messageLines = [
      '🟢 NUOVO ORDINE ASPORTO',
      '',
      `Cliente: ${nome}`,
      `Telefono: ${telefono}`,
      `Orario ritiro: ${orario}`,
      '',
      'Ordine:'
    ];

    items.forEach((item) => {
      messageLines.push(`- ${item.quantita}x ${item.nome}`);
    });

    messageLines.push('');
    messageLines.push(`Totale: €${formatCurrency(total)}`);

    if (pagamento) {
      messageLines.push(`Pagamento: ${pagamento}`);
    }

    if (note) {
      messageLines.push(`Note: ${note}`);
    }

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const telegramResponse = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: messageLines.join('\n')
        })
      });

      const telegramResult = await telegramResponse.json();
      if (!telegramResult.ok) {
        throw new Error(`Telegram API error: ${telegramResult.description}`);
      }
    }

    if (RESEND_API_KEY && RESEND_FROM_EMAIL && ADMIN_EMAIL) {
      const emailBody = `
        <h2>Nuovo ordine asporto</h2>
        <p><strong>Cliente:</strong> ${nome}</p>
        <p><strong>Telefono:</strong> ${telefono}</p>
        <p><strong>Orario ritiro:</strong> ${orario}</p>
        <h3>Ordine</h3>
        <ul>
          ${items.map((item) => `<li>${item.quantita}x ${item.nome}</li>`).join('')}
        </ul>
        <p><strong>Totale:</strong> €${formatCurrency(total)}</p>
        ${note ? `<p><strong>Note:</strong> ${note}</p>` : ''}
      `;

      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: RESEND_FROM_EMAIL,
          to: [ADMIN_EMAIL],
          subject: `Nuovo ordine AL DOGE #${orderId}`,
          html: emailBody
        })
      });

      if (!emailResponse.ok) {
        const errorBody = await emailResponse.text();
        console.error('Errore invio email:', errorBody);
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        orderId,
        totale: formatCurrency(total)
      })
    };
  } catch (error) {
    console.error('Errore invio ordine:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Errore interno del server.' })
    };
  }
};
