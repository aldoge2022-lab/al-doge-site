let ultimiConsigli = [];

exports.handler = async function (event) {
  try {
    const { richiesta } = JSON.parse(event.body);

    const menu = `
PIZZE:

Margherita – Pomodoro, mozzarella, origano – €6,00
Prosciutto e Funghi – Pomodoro, mozzarella, prosciutto cotto, funghi – €8,00
Prosciutto – Pomodoro, mozzarella, prosciutto cotto – €7,50
Viennese – Pomodoro, mozzarella, wurstel – €7,00
Siciliana – Pomodoro, mozzarella, acciughe, capperi, olive nere – €8,50
Chips – Pomodoro, mozzarella, patate fritte – €6,50
Capricciosa – Pomodoro, mozzarella, prosciutto cotto, funghi, carciofi – €8,00
4 Stagioni – Pomodoro, mozzarella, prosciutto cotto, peperoni, funghi, carciofi – €8,50
4 Formaggi – Pomodoro, mozzarella, formaggi misti, gorgonzola – €8,50
Pugliese – Pomodoro, mozzarella, cipolla – €6,50
Bresaola Rucola e Grana – Pomodoro, mozzarella, bresaola, rucola, grana – €9,00
San Daniele – Pomodoro, mozzarella, prosciutto crudo San Daniele – €9,00
Diavola – Pomodoro, mozzarella, salamino piccante – €8,00
Panna e Speck – Pomodoro, mozzarella, panna, speck – €8,50
Marinara – Pomodoro, aglio, origano – €5,50
Friulana – Pomodoro, mozzarella, patate al forno, salame dolce, cipolla – €9,00
Calzone – Pomodoro, mozzarella, prosciutto cotto, funghi – €8,00
Romana – Pomodoro, mozzarella, acciughe – €7,50
Tonno e Cipolla – Pomodoro, mozzarella, tonno, cipolla – €7,50
Nirvana – Pomodoro, mozzarella, prosciutto cotto, brie, salsiccia, San Daniele – €10,00
Napoletana – Pomodoro, mozzarella, acciughe, olive nere – €8,00
8 Gusti – Pizza speciale mista – €10,00
Boscaiola – Pomodoro, mozzarella, porcini, panna, speck – €8,50
Primo Amore – Pomodoro, mozzarella, mozzarelline, pomodorini – €8,00
Bufala – Pomodoro, mozzarella, mozzarella di bufala – €9,00
Estate – Pomodoro, mozzarella, rucola, pomodorini – €8,50
Autunno – Pomodoro, mozzarella, zucca, salsiccia – €8,50
Inverno – Pomodoro, mozzarella, radicchio, grana – €7,50
Contadina – Pomodoro, mozzarella, radicchio, salsiccia – €8,50
Texana – Pomodoro, mozzarella, fagioli, salsiccia, peperoncino – €8,00
Sfiziosa – Pomodoro, mozzarella, radicchio, gorgonzola, speck – €9,00
La Greca – Pomodoro, mozzarella, feta, olive – €7,50
Nicolò – Pomodoro, mozzarella, zucchine, philadelphia – €8,50
Fresca – Pomodoro, mozzarella, scamorza, pomodorini – €8,50

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
          model: "grok-2-latest",
          messages: [
            { role: "system", content: "Sei uno chef italiano esperto." },
            { role: "user", content: prompt },
          ],
          temperature: 0.85,
        }),
      }
    );

    const data = await response.json();
    const testo =
      data.choices?.[0]?.message?.content ||
      "Non riusciamo a consigliarti ora.";

    // salva memoria
    const match = testo.match(/([A-Z][a-zA-Z\s]+)/);
    if (match) {
      ultimiConsigli.push(match[1]);
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
        risposta: "Errore AI. Chiamaci direttamente per un consiglio personalizzato.",
      }),
    };
  }
};
