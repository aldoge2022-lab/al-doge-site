// Netlify Function per Notifiche Telegram
// Necessita di TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID nelle environment variables

exports.handler = async (event) => {
  // Gestione CORS
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

  try {
    const order = JSON.parse(event.body);
    
    // Verifica variabili ambiente
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.log('Telegram non configurato. Ordine ricevuto ma notifica non inviata.');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: true, 
          telegram_enabled: false,
          message: 'Ordine salvato (Telegram non configurato - configura TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID)' 
        })
      };
    }

    // Formatta messaggio
    const message = formatOrderMessage(order);

    // Invia messaggio a Telegram
    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      })
    });

    const result = await response.json();

    if (!result.ok) {
      throw new Error(`Telegram API error: ${result.description}`);
    }

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: true,
        telegram_enabled: true,
        message: 'Notifica inviata con successo' 
      })
    };

  } catch (error) {
    console.error('Errore invio notifica Telegram:', error);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        error: error.message 
      })
    };
  }
};

function formatOrderMessage(order) {
  const { orderId, customer, pickup, items, total, tableNumber } = order;
  
  let message = '';
  
  if (tableNumber) {
    // Pagamento al tavolo
    message = `🍕 <b>PAGAMENTO TAVOLO #${tableNumber}</b>\n\n`;
    message += `💰 Importo: €${total.toFixed(2)}\n`;
    message += `✅ PAGATO\n\n`;
    message += `⏰ ${new Date().toLocaleString('it-IT')}`;
  } else {
    // Ordine normale
    message = `🍕 <b>NUOVO ORDINE #${orderId}</b>\n\n`;
    message += `👤 Nome: ${customer.name}\n`;
    message += `📞 Tel: ${customer.phone}\n`;
    message += `🕐 Ritiro: ${formatDate(pickup.date)} - ${pickup.time}\n\n`;
    
    message += `📦 <b>ORDINE:</b>\n`;
    items.forEach(item => {
      const itemTotal = item.price * item.quantity;
      message += `- ${item.quantity}x ${item.name} (€${itemTotal.toFixed(2)})\n`;
      if (item.ingredients && item.ingredients.length > 0) {
        message += `  <i>${item.ingredients.join(', ')}</i>\n`;
      }
    });
    
    message += `\n💰 Totale: €${total.toFixed(2)}\n`;
    message += `✅ PAGATO\n`;
    
    if (customer.notes) {
      message += `\n📝 Note: ${customer.notes}`;
    }
  }
  
  return message;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const days = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}
