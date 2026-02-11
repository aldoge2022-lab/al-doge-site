

let ultimiConsigli = [];

exports.handler = async function (event) {
  try {
    if (!process.env.GROK_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          risposta: "Chiave API non configurata correttamente.",
        }),
      };
    }

    const { richiesta } = JSON.parse(event.body);

    const menu = `
PIZZE:
Margherita – Pomodoro, mozzarella, origano – €6,00
Capricciosa – Pomodoro, mozzarella, prosciutto cotto, funghi, carciofi – €8,00
4 Stagioni – Pomodoro, mozzarella, prosciutto cotto, peperoni, funghi, carciofi – €8,50
Siciliana – Pomodoro, mozzarella, acciughe, capperi, olive nere – €8,50
San Daniele – Pomodoro, mozzarella, prosciutto crudo San Daniele – €9,00
Diavola – Pomodoro, mozzarella, salamino piccante – €8,00
Bufala – Pomodoro, mozzarella, mozzarella di bufala – €9,00
Boscaiola – Pomodoro, mozzarella, porcini, panna, speck – €8,50

BEVANDE:
Birra artigianale chiara
Birra rossa
Coca-Cola
Acqua naturale
Acqua frizzante
Vino rosso della casa
Vino bianco della casa
Spritz
Prosecco
`;

    const memoria =
      ultimiConsigli.length > 0
        ? `Evita di proporre: ${ultimiConsigli.join(", ")}`
        : "";

    const prompt = `
Sei un consulente gastronomico premium della pizzeria AL DOGE.

Menu:
${menu}

Cliente scrive: "${richiesta}"

${memoria}

Regole:
- Consiglia UNA sola pizza
- Inserisci stima calorie
- Suggerisci una bevanda coerente
- Spiega in modo elegante perché l'abbinamento funziona
- Massimo 4 frasi
- Tono professionale e raffinato
`;

    const response = await fetch(
      "https://api.x.ai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "grok-2",
          messages: [
            { role: "system", content: "Sei uno chef italiano esperto." },
            { role: "user", content: prompt },
          ],
          temperature: 0.8,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          risposta: "Errore API Grok: " + JSON.stringify(data),
        }),
      };
    }

    const testo =
      data.choices?.[0]?.message?.content ||
      "Non riusciamo a consigliarti ora.";

    // Memoria semplice
    const match = testo.match(/Margherita|Capricciosa|4 Stagioni|Siciliana|San Daniele|Diavola|Bufala|Boscaiola/);
    if (match) {
      ultimiConsigli.push(match[0]);
      if (ultimiConsigli.length > 5) ultimiConsigli.shift();
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ risposta: testo }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        risposta: "Errore AI. Controlla configurazione API.",
      }),
    };
  }
};
