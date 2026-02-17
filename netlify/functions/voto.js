const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method not allowed" };
    }

    const { pizza_id, week_id } = JSON.parse(event.body || "{}");
    if (!pizza_id || !week_id) {
      return { statusCode: 400, body: JSON.stringify({ error: "Dati mancanti" }) };
    }

    const store = getStore("al-doge");
    const key = "pizze_settimana";
    const saved = await store.get(key, { type: "json" });

    if (!saved || saved.week_id !== week_id || !Array.isArray(saved.pizze)) {
      return { statusCode: 409, body: JSON.stringify({ error: "Settimana non valida" }) };
    }

    const pizze = saved.pizze.map(p => {
      if (p.id === pizza_id) return { ...p, voti: (p.voti || 0) + 1 };
      return p;
    });

    const result = { ...saved, pizze };
    await store.set(key, JSON.stringify(result), { contentType: "application/json" });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: "Errore interno" }) };
  }
};
