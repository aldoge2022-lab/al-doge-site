export default async (req, context) => {
  try {
    const { testo } = await req.json();

    const prompt = `
Sei il consulente gastronomico della pizzeria AL DOGE.
Devi consigliare in modo SEMPLICE e VELOCE cosa mangiare.

MENU DISPONIBILE:

PIZZE:
- Margherita
- Friulana (pomodoro, mozzarella, patate al forno, salame dolce, cipolla)
- La Doge Special (pomodoro, mozzarella, speck, gorgonzola, noci)

PANINI:
- Prosciutto crudo e rucola
- Speck e formaggio
- Salame e mozzarella

Regole:
- Rispondi in massimo 2 frasi
- Sii concreto
- Consiglia UNA cosa sola
- Non fare domande

Richiesta cliente:
"${testo}"
`;

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROK_API_KEY}`
      },
      body: JSON.stringify({
        model: "grok-2",
        messages: [
          { role: "system", content: "Sei un esperto pizzaiolo e paninaro italiano." },
          { role: "user", content: prompt }
        ],
        temperature: 0.4
      })
    });

    const data = await response.json();
    const risposta = data.choices[0].message.content;

    return new Response(JSON.stringify({ risposta }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      risposta: "Ti consigliamo una delle nostre pizze speciali. Per ordinare chiamaci o passa in pizzeria."
    }), { status: 200 });
  }
};
