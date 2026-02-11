export async function handler(event) {
  try {
    const { richiesta } = JSON.parse(event.body);

    const prompt = `
Sei l’assistente della pizzeria AL DOGE.
Crea un consiglio personalizzato per il cliente.

Puoi usare solo questi ingredienti:
- Pomodoro
- Mozzarella
- Speck
- Gorgonzola
- Noci
- Patate al forno
- Salame dolce
- Cipolla
- Rucola
- Prosciutto crudo

Il cliente ha scritto: "${richiesta}"

Rispondi con:
- Nome creativo della pizza o panino
- Ingredienti
- Breve descrizione invitante
Non scrivere introduzioni.
`;

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROK_API_KEY}`
      },
      body: JSON.stringify({
        model: "grok-2-latest",
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.8
      })
    });

    const data = await response.json();

    const testo = data.choices?.[0]?.message?.content || 
      "Non riusciamo a consigliarti ora. Chiamaci 😉";

    return {
      statusCode: 200,
      body: JSON.stringify({ risposta: testo })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        risposta: "Errore AI. Prova o chiamaci direttamente."
      })
    };
  }
}
