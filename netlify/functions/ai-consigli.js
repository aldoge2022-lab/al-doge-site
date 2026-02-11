import fetch from "node-fetch";
import menu from "../../menu.json" assert { type: "json" };

export const handler = async (event) => {
  try {
    const { richiesta } = JSON.parse(event.body);

    if (!process.env.XAI_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          risposta: "Chiave API non configurata correttamente.",
        }),
      };
    }

    const prompt = `
Sei un consulente gastronomico premium della pizzeria AL DOGE.

Usa questo menu ufficiale:
${JSON.stringify(menu)}

Cliente chiede: "${richiesta}"

Regole:
- Consiglia UNA sola pizza
- Inserisci stima calorie usando ingredienti_kcal
- Suggerisci una bevanda coerente
- Spiega in modo elegante perché l'abbinamento funziona
- Massimo 4 frasi
- Tono professionale e raffinato
    `.trim();

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-4-1",
        messages: [
          { role: "system", content: "Sei uno chef italiano esperto." },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
      }),
    });

    const data = await response.json();

    const testo =
      data.choices?.[0]?.message?.content ||
      "Non riusciamo a consigliarti ora.";

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
