const { getStore } = require("@netlify/blobs");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function cleanJsonFence(s) {
  const t = String(s || "").trim();
  if (t.startsWith("```")) return t.replace(/```json|```/g, "").trim();
  return t;
}

exports.handler = async () => {
  try {
    const store = getStore("al-doge");
    const key = "pizza_giorno";
    const today = todayISO();

    const saved = await store.get(key, { type: "json" });
    if (saved && saved.date === today && saved.pizza) {
      return { statusCode: 200, body: JSON.stringify(saved) };
    }

    const prompt = `
Crea una pizza del giorno per una pizzeria italiana.
Ingredienti realistici e fattibili.
Rispondi SOLO con questo JSON:

{
  "nome": "Nome pizza",
  "ingredienti": "lista ingredienti separati da virgola",
  "descrizione": "1 frase breve"
}
`.trim();

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROK_API_KEY}`
      },
      body: JSON.stringify({
        model: "grok-beta",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 220
      })
    });

    if (!response.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: "API non disponibile" }) };
    }

    const data = await response.json();
    const content = cleanJsonFence(data?.choices?.[0]?.message?.content);
    const pizza = JSON.parse(content);

    const result = { date: today, pizza };
    await store.set(key, JSON.stringify(result), { contentType: "application/json" });

    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: "Errore interno" }) };
  }
};
