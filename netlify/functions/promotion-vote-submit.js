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

function ipHash(event) {
  const raw = event.headers["x-forwarded-for"] || event.headers["X-Forwarded-For"] || "";
  const ip = String(raw).split(",")[0].trim();
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip).digest("hex");
}

async function readCounts(supabaseUrl, supabaseKey) {
  const url = `${supabaseUrl}/rest/v1/promotion_votes?promotion=eq.${encodeURIComponent(PROMOTION_NAME)}&select=choice`;
  const response = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
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
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "Method Not Allowed" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return json(500, { ok: false, error: "Missing Supabase credentials" });
    }

    let data = {};
    try {
      data = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { ok: false, error: "Invalid JSON" });
    }

    const choice = clean(data.choice);
    if (!ALLOWED.has(choice)) {
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
        source: "sito_web",
      }),
    });

    const insertText = await insert.text();
    if (!insert.ok) {
      console.error("promotion-vote-submit insert error", insertText);
      return json(500, { ok: false, error: "Insert failed", details: insertText });
    }

    let saved = null;
    try { saved = insertText ? JSON.parse(insertText) : null; } catch {}
    const counts = await readCounts(supabaseUrl, supabaseKey);

    return json(200, {
      ok: true,
      choice,
      counts,
      id: Array.isArray(saved) && saved[0] ? saved[0].id : null,
    });
  } catch (error) {
    console.error("promotion-vote-submit error", error);
    return json(500, { ok: false, error: "Internal Server Error", message: String(error.message || error) });
  }
};
