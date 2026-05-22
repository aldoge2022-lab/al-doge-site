const fetch = require("node-fetch");

const PROMOTION_NAME = "Giovedì del Doge";
const ALLOWED = new Set(["Doge", "San Daniele e Burrata", "Boscaiola"]);

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== "GET") {
      return json(405, { ok: false, error: "Method Not Allowed" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return json(500, { ok: false, error: "Missing Supabase credentials" });
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/promotion_votes?promotion=eq.${encodeURIComponent(PROMOTION_NAME)}&select=choice`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    const text = await response.text();
    if (!response.ok) {
      console.error("promotion-vote-counts error", text);
      return json(500, { ok: false, error: "Count failed", details: text });
    }

    const rows = text ? JSON.parse(text) : [];
    const counts = { Doge: 0, "San Daniele e Burrata": 0, Boscaiola: 0 };
    rows.forEach((row) => {
      if (row && ALLOWED.has(row.choice)) counts[row.choice] += 1;
    });

    return json(200, { ok: true, promotion: PROMOTION_NAME, counts });
  } catch (error) {
    console.error("promotion-vote-counts error", error);
    return json(500, { ok: false, error: "Internal Server Error", message: String(error.message || error) });
  }
};
