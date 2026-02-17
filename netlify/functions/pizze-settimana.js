const { getStore } = require("@netlify/blobs");

function weekIdISO(date = new Date()) {
  // Week id semplice: anno + numero settimana ISO approssimato via lunedì corrente
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 1 - day); // lunedì
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function cleanJsonFence(s) {
  const t = String(s || "").trim();
  if (t.startsWith("```")) return t.replace(/```json|```/g, "").trim();
  return t;
}

exports.handler = async () => {
  try {
    const store = getStore("al-doge");
    const key = "pizze_settimana";
    const week_id = weekIdISO();

    const saved = await store.get(key, { type: "json" });
    if (saved && saved.week_id === week_id && Array.isArray(saved.pizze)) {
      return { statusCode: 200, body: JSON.stringify(saved) };
    }

    const prompt = `
Crea 3 pizze realistiche per una pizzeria italiana.
Rispondi SOLO in JSON (array), ogni pizza con:

[
  { "id": "p1", "nome": "...", "ingredienti": "...", "descrizione": "..." },
  { "id": "p2", "nome": "...", "ingredienti": "...", "descrizione": "..." },
  { "id": "p3", "nome": "...", "ingredienti": "...", "descrizione": "..." }
]

Regole:
- ingredienti realistici e fattibili
- descrizione massimo 1 frase
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
        temperature: 0.75,
        max_tokens: 450
      })
    });

    if (!response.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: "API non disponibile" }) };
    }

    const data = await response.json();
    const content = cleanJsonFence(data?.choices?.[0]?.message?.content);
    const pizzeRaw = JSON.parse(content);

    // Inizializza voti a 0
    const pizze = pizzeRaw.map((p, idx) => ({
      id: p.id || `p${idx + 1}`,
      nome: p.nome,
      ingredienti: p.ingredienti,
      descrizione: p.descrizione,
      voti: 0
    }));

    const result = { week_id, pizze };
    await store.set(key, JSON.stringify(result), { contentType: "application/json" });

    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: "Errore interno" }) };
  }
};
