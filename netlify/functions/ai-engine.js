const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");
const { validatePaninoInput } = require("../../core/panino/panino-validator");
const { calculatePaninoPrice } = require("../../core/panino/panino-pricing");

const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
const openai = hasOpenAI ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const hasSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const supabase = hasSupabase
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

if (!hasOpenAI) {
  console.warn("[AI_ENGINE][CONFIG]", "OPENAI_API_KEY non configurata: uso fallback deterministico.");
}

if (!hasSupabase) {
  console.warn("[AI_ENGINE][CONFIG]", "SUPABASE non configurato: uso fallback statico per il menu.");
}

const PANINO_WHITELIST = [
  "pomodoro",
  "mozzarella",
  "prosciutto cotto",
  "prosciutto crudo san daniele",
  "funghi freschi",
  "funghi porcini",
  "origano",
  "wurstel",
  "acciughe",
  "capperi",
  "olive nere",
  "olive verdi",
  "olive taggiasche",
  "patate fritte",
  "patate al forno",
  "carciofi",
  "peperoni",
  "gorgonzola",
  "brie",
  "feta",
  "philadelphia",
  "scamorza",
  "mozzarella di bufala",
  "ricotta affumicata",
  "grana",
  "cipolla",
  "bresaola",
  "speck",
  "salamino piccante",
  "salame dolce",
  "salsiccia",
  "tonno",
  "rucola",
  "radicchio di treviso",
  "zucchine",
  "pomodorini",
  "mozzarelline",
  "panna",
  "peperoncino",
  "aglio",
  "fagioli",
  "purea di zucca",
  "asparagi"
];

const DEFAULT_PIZZA_FALLBACK = {
  nome: "Margherita",
  prezzo: 6,
  ingredienti: ["pomodoro", "mozzarella", "origano"]
};
const DEFAULT_PANINO_INGREDIENTS = ["pomodoro", "mozzarella", "prosciutto cotto"];

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  };
}

function normalize(text = "") {
  return String(text).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
}

function normalizeIngredient(value = "") {
  return normalize(value);
}

function determineDomain(message = "") {
  const text = normalize(message);
  if (text.includes("panino") || text.includes("panini") || text.includes("sandwich") || text.includes("burger")) {
    return "panino";
  }
  return "pizza";
}

async function interpretPizzaIntent(message) {
  if (!openai) {
    return {
      include: [],
      exclude: [],
      spicy: false,
      white_base: false,
      category_hint: null
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Sei un parser di intent per una pizzeria.
Restituisci SOLO JSON valido conforme a questo schema:
{
  "include": string[],
  "exclude": string[],
  "spicy": boolean,
  "white_base": boolean,
  "category_hint": string | null
}
`
        },
        { role: "user", content: message }
      ]
    });

    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    return {
      include: Array.isArray(parsed.include) ? parsed.include : [],
      exclude: Array.isArray(parsed.exclude) ? parsed.exclude : [],
      spicy: Boolean(parsed.spicy),
      white_base: Boolean(parsed.white_base),
      category_hint: typeof parsed.category_hint === "string" ? parsed.category_hint : null
    };
  } catch (error) {
    console.error("[AI_ENGINE][INTENT_ERROR]", { message: error.message });
    return {
      include: [],
      exclude: [],
      spicy: false,
      white_base: false,
      category_hint: null
    };
  }
}

async function fetchMenu() {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("menu_items")
    .select("id, nome, Nome, Categoria, categoria, Prezzo, prezzo, ingredienti, disponibile")
    .eq("disponibile", true);

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? data : [];
}

function mapMenuItem(raw = {}) {
  return {
    id: raw.id || null,
    nome: raw.nome || raw.Nome || DEFAULT_PIZZA_FALLBACK.nome,
    categoria: raw.categoria || raw.Categoria || "pizza",
    prezzo: Number(raw.prezzo ?? raw.Prezzo ?? DEFAULT_PIZZA_FALLBACK.prezzo) || 0,
    ingredienti: Array.isArray(raw.ingredienti) ? raw.ingredienti : DEFAULT_PIZZA_FALLBACK.ingredienti
  };
}

function scorePizza(intent, pizza) {
  let score = 0;
  const ingredients = Array.isArray(pizza.ingredienti) ? pizza.ingredienti : [];

  intent.include.forEach((req) => {
    if (ingredients.some((i) => normalize(i).includes(normalize(req)))) {
      score += 3;
    }
  });

  intent.exclude.forEach((ex) => {
    if (ingredients.some((i) => normalize(i).includes(normalize(ex)))) {
      score -= 5;
    }
  });

  if (intent.spicy) {
    if (ingredients.some((i) => normalize(i).includes("piccante") || normalize(i).includes("peperoncino"))) {
      score += 2;
    }
  }

  if (intent.white_base) {
    if (!ingredients.some((i) => normalize(i).includes("pomodoro"))) {
      score += 2;
    }
  }

  if (intent.category_hint && pizza.categoria) {
    if (normalize(pizza.categoria).includes(normalize(intent.category_hint))) {
      score += 2;
    }
  }

  return score;
}

async function handlePizza(message) {
  const intent = await interpretPizzaIntent(message);
  let menu = [];

  try {
    menu = (await fetchMenu()).map(mapMenuItem);
  } catch (error) {
    console.error("[AI_ENGINE][MENU_ERROR]", { message: error.message });
    menu = [];
  }

  const availableMenu = menu.length ? menu : [DEFAULT_PIZZA_FALLBACK];

  const scored = availableMenu.map((pizza) => ({
    ...pizza,
    score: scorePizza(intent, pizza)
  }));

  scored.sort((a, b) => b.score - a.score || Number(a.prezzo) - Number(b.prezzo));

  const best = scored[0] && scored[0].score > 0 ? scored[0] : availableMenu[0] || DEFAULT_PIZZA_FALLBACK;
  const item = {
    id: best.id || null,
    nome: best.nome || DEFAULT_PIZZA_FALLBACK.nome,
    prezzo: Number(best.prezzo) || DEFAULT_PIZZA_FALLBACK.prezzo,
    ingredienti: Array.isArray(best.ingredienti) ? best.ingredienti : DEFAULT_PIZZA_FALLBACK.ingredienti
  };

  return {
    ok: true,
    type: "pizza",
    reply: `Ti consiglio la ${item.nome} (€${item.prezzo.toFixed(2)}). Vuoi aggiungerla al carrello?`,
    item
  };
}

async function extractPaninoIngredients(message) {
  if (!openai) {
    return [];
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Estrai gli ingredienti per un panino personalizzato.
Usa solo questi ingredienti consentiti: ${PANINO_WHITELIST.join(", ")}.
Rispondi solo con JSON valido: {"ingredients": ["..."]}.`
        },
        { role: "user", content: message }
      ]
    });

    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    return Array.isArray(parsed.ingredients) ? parsed.ingredients.map(normalizeIngredient) : [];
  } catch (error) {
    console.error("[AI_ENGINE][PANINO_LLM_ERROR]", { message: error.message });
    return [];
  }
}

function validatePaninoIngredients(ingredients = []) {
  const filtered = ingredients
    .filter(Boolean)
    .map(normalizeIngredient)
    .filter((ing) => PANINO_WHITELIST.includes(ing));

  const unique = Array.from(new Set(filtered));
  const baseList = unique.length ? unique : DEFAULT_PANINO_INGREDIENTS;

  const validation = validatePaninoInput({ ingredients: baseList });
  if (!validation.ok) {
    return DEFAULT_PANINO_INGREDIENTS;
  }

  return validation.ingredients;
}

async function handlePanino(message) {
  const extracted = await extractPaninoIngredients(message);
  const ingredients = validatePaninoIngredients(extracted);
  const prezzo = calculatePaninoPrice(ingredients);

  return {
    ok: true,
    type: "panino",
    reply: `Ho creato il tuo Panino Custom con ${ingredients.join(", ")}. Prezzo €${prezzo.toFixed(2)}. Vuoi aggiungerlo al carrello?`,
    item: {
      nome: "Panino Custom",
      ingredienti: ingredients,
      prezzo
    }
  };
}

exports.handler = async (event) => {
  let domain = "pizza";

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, type: domain, reply: "Metodo non consentito", item: null });
  }

  try {
    const { message } = JSON.parse(event.body || "{}");
    domain = determineDomain(message || "");

    if (!message) {
      return json(400, { ok: false, type: domain, reply: "Devi indicare cosa vuoi ordinare.", item: null });
    }

    if (domain === "panino") {
      const response = await handlePanino(message);
      return json(200, response);
    }

    const response = await handlePizza(message);
    return json(200, response);
  } catch (error) {
    console.error("[AI_ENGINE][UNCAUGHT]", { message: error.message, stack: error.stack });
    return json(500, { ok: false, type: domain, reply: "Servizio AI non disponibile al momento.", item: null });
  }
};
