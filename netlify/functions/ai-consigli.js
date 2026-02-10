export async function handler(event) {
  const { richiesta } = JSON.parse(event.body);

  const prompt = `
Sei il pizzaiolo esperto della pizzeria AL DOGE.
Consiglia UNA sola pizza usando SOLO queste opzioni reali:

- La Friulana (pomodoro, mozzarella, patate al forno, salame dolce, cipolla)
- La Doge Special (pomodoro, mozzarella, speck, gorgonzola, noci)
- Margherita

Regole:
- NON inventare ingredienti
- Rispondi in italiano
- Rispondi SOLO in JSON con:
{
  "nome": "...",
  "motivo": "..."
}

Richiesta cliente:
"${richiesta}"
`;

  const res = await fetch("https://api.x.ai/v1/chat/completions",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":"Bearer " + process.env.GROK_API_KEY
    },
    body:JSON.stringify({
      model:"grok-4-latest",
      messages:[{ role:"user", content: prompt }],
      temperature:0.6
    })
  });

  const data = await res.json();

  return {
    statusCode:200,
    body: data.choices[0].message.content
  };
}
