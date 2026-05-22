const fetch = require("node-fetch");

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function getConfig() {
  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  };
}

async function supabaseGet(path) {
  const { url, key } = getConfig();
  if (!url || !key) throw new Error("Missing Supabase credentials");
  const res = await fetch(url + "/rest/v1/" + path, {
    headers: { apikey: key, Authorization: "Bearer " + key },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || "Supabase error " + res.status);
  return text ? JSON.parse(text) : [];
}

function countBy(rows, field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || "Non indicato";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

exports.handler = async function () {
  try {
    const [bookings, customers, consents, votes] = await Promise.all([
      supabaseGet("booking_requests?select=id,full_name,phone,booking_date,booking_time,people,preferred_zone,status,created_at&order=created_at.desc&limit=20"),
      supabaseGet("customers?select=id,full_name,phone,created_at&order=created_at.desc&limit=20"),
      supabaseGet("customer_consents?select=id,customer_id,consent_type,consent_value,created_at&order=created_at.desc&limit=20"),
      supabaseGet("promotion_votes?select=id,promotion,choice,source,created_at&order=created_at.desc&limit=200"),
    ]);

    const voteCounts = countBy(votes, "choice");
    const winner = Object.entries(voteCounts).sort((a, b) => b[1] - a[1])[0] || null;

    return json(200, {
      ok: true,
      generated_at: new Date().toISOString(),
      totals: {
        bookings: bookings.length,
        customers: customers.length,
        consents: consents.length,
        votes: votes.length,
      },
      bookings,
      customers,
      consents,
      votes,
      vote_counts: voteCounts,
      vote_winner: winner ? { choice: winner[0], votes: winner[1] } : null,
    });
  } catch (error) {
    console.error("admin-summary error", error);
    return json(500, { ok: false, error: String(error.message || error) });
  }
};
