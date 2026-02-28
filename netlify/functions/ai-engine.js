const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ------------------ INTERPRETAZIONE LLM ------------------

async function interpretLLM(message) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `
Sei un parser di intent per una pizzeria.
Restituisci SOLO JSON valido.
Non scrivere testo.

Schema obbligatorio:
{
  "include": string[],
  "exclude": string[],
  "spicy": boolean,
  "white_base": boolean,
  "category_hint": string | null
}
`
      },
      {
        role: "user",
        content: message
      }
    ]
  });

  return JSON.parse(response.choices[0].message.content);
}

// ------------------ MATCHING DETERMINISTICO ------------------

function scorePizza(intent, pizza) {
  let score = 0;
  const ingredients = pizza.ingredienti || [];

  intent.include.forEach(req => {
    if (ingredients.some(i => i.toLowerCase().includes(req.toLowerCase()))) {
      score += 3;
    }
  });

  intent.exclude.forEach(ex => {
    if (ingredients.some(i => i.toLowerCase().includes(ex.toLowerCase()))) {
      score -= 5;
    }
  });

  if (intent.spicy) {
    if (ingredients.some(i =>
      i.toLowerCase().includes("piccante") ||
      i.toLowerCase().includes("peperoncino")
    )) {
      score += 2;
    }
  }

  if (intent.white_base) {
    if (!ingredients.some(i => i.toLowerCase().includes("pomodoro"))) {
      score += 2;
    }
  }

  if (intent.category_hint && pizza.Categoria) {
    if (pizza.Categoria.toLowerCase().includes(intent.category_hint.toLowerCase())) {
      score += 2;
    }
  }

  return score;
}

// ------------------ HANDLER PRINCIPALE ------------------

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    const { message } = JSON.parse(event.body || "{}");

    if (!message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Messaggio mancante" })
      };
    }

    // 1️⃣ Interpretazione
    const intent = await interpretLLM(message);

    // 2️⃣ Recupero menu
    const { data, error } = await supabase
      .from("menu_items")
      .select("id, Nome, Categoria, Prezzo, ingredienti")
      .eq("disponibile", true);

    if (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message })
      };
    }

    // 3️⃣ Scoring
    const scored = data.map(pizza => ({
      ...pizza,
      score: scorePizza(intent, pizza)
    }));

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];

    // 4️⃣ Fallback controllato
    if (!best || best.score <= 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          reply: "Ti consiglio la Margherita (€6.00). Vuoi aggiungerla al carrello?"
        })
      };
    }

    // 5️⃣ Risposta finale
    return {
      statusCode: 200,
      body: JSON.stringify({
        reply: `Ti consiglio la ${best.Nome} (€${best.Prezzo}). Vuoi aggiungerla al carrello?`,
        pizza: best
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
