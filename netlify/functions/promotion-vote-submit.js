const crypto = require("crypto");
const fetch = require("node-fetch");

const PROMOTION_NAME = "Giovedì del Doge";
const ALLOWED = new Set(["Doge", "San Daniele e Burrata", "Boscaiola"]);

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function html(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body,
  };
}

function resultPage(title, message) {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#050403;color:#f3ead9;font-family:Arial,sans-serif;display:grid;min-height:100vh;place-items:center}.box{max-width:520px;margin:20px;border:1px solid rgba(210,186,124,.45);border-radius:22px;padding:28px;background:#11100d}h1{color:#d2ba7c;margin:0 0 12px;font-size:30px}p{line-height:1.45;color:#e8dcc4}.btn{display:inline-block;margin-top:14px;padding:13px 18px;border-radius:999px;background:#b99c62;color:#080706;font-weight:900;text-decoration:none}</style></head><body><div class="box"><h1>${title}</h1><p>${message}</p><a class="btn" href="/promozioni.html?v=ritorno-voto">Torna alle promozioni</a></div></body></html>`;
}

function ipHash(event) {
  const raw = event.headers["x-forwarded-for"] || event.headers["X-Forwarded-For"] || "";
  const ip = String(raw).split(",")[0].trim();
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip).digest("hex");
}

function readChoice(event) {
  if (event.httpMethod === "GET") {
    return clean((event.queryStringParameters || {}).choice);
  }
  try {
    const data = JSON.parse(event.body || "{}");
    return clean(data.choice);
  } catch {
    return "";
  }
}

async function readCounts(supabaseUrl, supabaseKey) {
  const url = `${supabaseUrl}/rest/v1/promotion_votes?promotion=eq.${encodeURIComponent(PROMOTION_NAME)}&select=choice`;
  const response = await fetch(url, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Count error ${response.status}`);
  const rows = text ? JSON.parse(text) : [];
  const counts = { Doge: 0, "San Daniele e Burrata": 0, Boscaiola: 0 };
  rows.forEach((row) => {
    if (row && ALLOWED.has(row.choice)) counts[row.choice] += 1;
  });
  return counts;
}

exports.handler = async function (event) {
  const wantsHtml = event.httpMethod === "GET";

  try {
    if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
      return json(405, { ok: false, error: "Method Not Allowed" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      if (wantsHtml) return html(500, resultPage("Errore", "Configurazione database mancante."));
      return json(500, { ok: false, error: "Missing Supabase credentials" });
    }

    const choice = readChoice(event);
    if (!ALLOWED.has(choice)) {
      if (wantsHtml) return html(400, resultPage("Voto non valido", "La scelta indicata non è valida."));
      return json(400, { ok: false, error: "Invalid choice" });
    }

    const insert = await fetch(`${supabaseUrl}/rest/v1/promotion_votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        promotion: PROMOTION_NAME,
        choice,
        user_agent: clean(event.headers["user-agent"] || event.headers["User-Agent"] || "") || null,
        ip_hash: ipHash(event),
        source: wantsHtml ? "sito_web_link" : "sito_web",
      }),
    });

    const insertText = await insert.text();
    if (!insert.ok) {
      console.error("promotion-vote-submit insert error", insertText);
      if (wantsHtml) return html(500, resultPage("Errore voto", "Il voto non è stato salvato nel database."));
      return json(500, { ok: false, error: "Insert failed", details: insertText });
    }

    let saved = null;
    try { saved = insertText ? JSON.parse(insertText) : null; } catch {}
    const counts = await readCounts(supabaseUrl, supabaseKey);

    if (wantsHtml) {
      return html(200, resultPage("Voto registrato", `Hai votato: <strong>${choice}</strong>. Il voto è stato salvato.`));
    }

    return json(200, {
      ok: true,
      choice,
      counts,
      id: Array.isArray(saved) && saved[0] ? saved[0].id : null,
    });
  } catch (error) {
    console.error("promotion-vote-submit error", error);
    if (wantsHtml) return html(500, resultPage("Errore", "Si è verificato un errore durante il voto."));
    return json(500, { ok: false, error: "Internal Server Error", message: String(error.message || error) });
  }
};
