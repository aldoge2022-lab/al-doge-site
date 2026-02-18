import fetch from "node-fetch";
import menu from "../../menu.json" assert { type: "json" };

export const handler = async (event) => {
  try {
    const { message } = JSON.parse(event.body);

    const systemPrompt = `
Sei l’assistente ufficiale della Pizzeria AL DOGE di Majano.

Usa SEMPRE le informazioni del seguente menu come fonte principale:
${JSON.stringify(menu)}

I tuoi compiti:
- consigliare pizze in base ai gusti del cliente (piccante, leggera, formaggi, verdure, ecc.)
- proporre alternative se un ingrediente non è disponibile
- abbinare automaticamente una bevanda ideale alla pizza o al panino scelto
- spiegare in modo semplice se una scelta è più leggera o più calorica
- creare panini personalizzati usando gli ingredienti disponibili
- fare domande intelligenti per capire i gusti del cliente
- evitare di inventare pizze o ingredienti non presenti nel menu

Quando un cliente chiede un panino:
1. Chiedi se lo vuole leggero, saporito o proteico.
2. Chiedi 2–3 ingredienti che preferisce (carne, formaggi, verdure).
3. Proponi 1–2 combinazioni possibili, indicando se sono leggere o più ricche.
4. Se possibile, stima le calorie usando impasto_pizza e ingredienti_kcal.

Stile:
- amichevole, chiaro, professionale
- risposte brevi ma complete
- tono accogliente, come un pizzaiolo esperto che conosce bene il cliente
- se il cliente è a dieta, privilegia pizze leggere (es. Marinara, pizze con meno formaggi e salumi) e panini con ingredienti magri (es. bresaola, verdure).
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
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        temperature: 0.7,
        max_tokens: 600
      }),
    });

    const data = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        reply: data.choices?.[0]?.message?.content ?? "Non riesco a rispondere in questo momento."
      }),
    };
  } catch (error) {
    console.error("Errore ai-chatbot:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Errore interno del server" }),
    };
  }
};
