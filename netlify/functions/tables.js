const { createClient } = require("@supabase/supabase-js");

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*"
};

const OPTIONS_HEADERS = {
  ...JSON_HEADERS,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const buildResponse = (statusCode, payload, headers = JSON_HEADERS) => ({
  statusCode,
  headers,
  body: JSON.stringify(payload)
});

const logError = (message, error) => {
  if (process.env.NODE_ENV === "production") {
    console.error(message);
    return;
  }

  console.error(message, error);
};

const getSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables not configured");
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: OPTIONS_HEADERS,
      body: ""
    };
  }

  if (event.httpMethod !== "GET") {
    return buildResponse(405, { error: "Metodo non consentito" });
  }

  const tableParam = event.queryStringParameters?.table;

  if (!tableParam) {
    return buildResponse(400, { error: "Parametro table mancante" });
  }

  const tableNumber = Number(tableParam);

  if (!Number.isInteger(tableNumber)) {
    return buildResponse(400, { error: "Parametro table non valido" });
  }

  let supabase;

  try {
    supabase = getSupabaseClient();
  } catch (error) {
    logError("Supabase configuration error", error);
    return buildResponse(500, { error: "Configurazione server mancante" });
  }

  try {
    const { data, error } = await supabase
      .from("tables")
      .select("id, numero, created_at")
      .eq("numero", tableNumber)
      .maybeSingle();

    if (error) {
      logError("Supabase query error", error);
      return buildResponse(500, { error: "Errore database" });
    }

    if (!data) {
      return buildResponse(404, { error: "Tavolo non trovato" });
    }

    return buildResponse(200, data);
  } catch (error) {
    logError("Unexpected server error", error);
    return buildResponse(500, { error: "Errore server" });
  }
};
