const crypto = require("crypto");
const fetch = require("node-fetch");

const ALLOWED_CHOICES = new Set(["Doge", "San Daniele e Burrata", "Boscaiola"]);
const PROMOTION_NAME = "Giovedì del Doge";

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getClientIp(event) {
  const forwardedFor = event.headers["x-forwarded-for"] || event.headers["X-Forwarded-For"] || "";
  return forwardedFor.split(",")[0].trim() || event.headers["client-ip"] || "";
}

function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip).digest("hex");
}

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { ok: false, error: "Method Not Allowed" });
    }

    let data;
    try {
      data = JSON.parse(event.body || "{}");
    } catch (error) {
      return jsonResponse(400, { ok: false, error: "Invalid JSON payload" });
    }

    const choice = clean(data.choice);
    const promotion = clean(data.promotion) || PROMOTION_NAME;

    if (promotion !== PROMOTION_NAME || !ALLOWED_CHOICES.has(choice)) {
      return jsonResponse(400, { ok: false, error: "Invalid promotion vote" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse(500, { ok: false, error: "Missing Supabase credentials" });
    }

    const userAgent = clean(event.headers["user-agent"] || event.headers["User-Agent"] || "");
    const ipHash = hashIp(getClientIp(event));

    const response = await fetch(`${supabaseUrl}/rest/v1/promotion_votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        promotion,
        choice,
        user_agent: userAgent || null,
        ip_hash: ipHash,
        source: "sito_web",
      }),
    });

    const text = await response.text();

    if (!response.ok) {
      console.error("Promotion vote Supabase error:", text);
      return jsonResponse(500, { ok: false, error: "Vote database error" });
    }

    let saved = null;
    try {
      saved = text ? JSON.parse(text) : null;
    } catch {
      saved = null;
    }

    return jsonResponse(200, {
      ok: true,
      message: "Vote saved",
      choice,
      promotion,
      id: Array.isArray(saved) && saved[0] ? saved[0].id : null,
    });
  } catch (error) {
    console.error("Promotion vote function error:", error);
    return jsonResponse(500, { ok: false, error: "Internal Server Error" });
  }
};
