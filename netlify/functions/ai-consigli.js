export async function handler(event) {
  try {
    const { richiesta } = JSON.parse(event.body);

    const prompt = `
Sei l’assistente della pizzeria AL DOGE.
Crea un consiglio personalizzato usando solo ingredienti reali.

Ingredienti disponibili:
Pomodoro, Mozzarella, Speck, Gorgonzola, Noci,
Patate al forno, Salame dolce, Cipolla, Rucola, Prosciutto crudo.

Richiesta cliente: "${richiesta}"

Rispondi in modo breve e diretto.
`;

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROK_API_KEY}`
      },
      body: JSON.stringify({
        model: "grok-4-latest",
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();

    console.log("AI response:", data);

    const testo = data?.choices?.[0]?.message?.content;

    if (!testo) {
      throw new Error("Nessuna risposta valida da Grok");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ risposta: testo })
    };

  } catch (error) {
    console.error("Errore AI:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        risposta: "Errore AI. Prova o chiamaci direttamente."
      })
    };
  }
}
