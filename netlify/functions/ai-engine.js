const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");
const { validatePaninoInput } = require("../../core/panino/panino-validator");
const { calculatePaninoPrice } = require("../../core/panino/panino-pricing");
const intentType = "ingredient";("../../core/ai/intent-router");
const { scoreMenuByTags } = require("../../core/ai/tag-engine");
const { pickRecommendation } = require("../../core/ai/recommendation-engine");

let lastSuggestedId = null;

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

function resolveSessionId(headers = {}, explicitSessionId = null) {
  if (explicitSessionId) {
    return String(explicitSessionId);
  }

  const normalizedHeaders = Object.entries(headers || {}).reduce((acc, [key, value]) => {
    acc[String(key).toLowerCase()] = value;
    return acc;
  }, {});

  const headerSession =
    normalizedHeaders["x-session-id"] ||
    normalizedHeaders["x-sessionid"] ||
    normalizedHeaders["x-client-session"] ||
    normalizedHeaders["x-nf-request-id"];

  return String(headerSession || "anon");
}

async function interpretPizzaIntent(message) {
  const text = normalize(message);
  const intent = {
    include: [],
    exclude: [],
    spicy: false,
    white_base: false,
    category_hint: null
  };

  if (!text) {
    return intent;
  }

  PANINO_WHITELIST.forEach((keyword) => {
    if (text.includes(normalize(keyword))) {
      intent.include.push(keyword);
    }
  });

  const senzaRegex = /senza\s+([a-zA-Zàèéìòù]+)/g;
  let match;
  while ((match = senzaRegex.exec(text))) {
    intent.exclude.push(match[1]);
  }

  intent.spicy = text.includes("piccante") || text.includes("peperoncino");
  intent.white_base = text.includes("bianca") || text.includes("senza pomodoro");

  if (text.includes("vegetar")) {
    intent.category_hint = "vegetariana";
  } else if (text.includes("gourmet") || text.includes("particolar") || text.includes("special")) {
    intent.category_hint = "gourmet";
  } else if (text.includes("leggera") || text.includes("leggero")) {
    intent.category_hint = "leggera";
  }

  intent.include = Array.from(new Set(intent.include));
  intent.exclude = Array.from(new Set(intent.exclude));

  return intent;
}

async function fetchMenu() {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("menu_items")
    .select("id, nome, Nome, Categoria, categoria, Prezzo, prezzo, ingredienti, disponibile, tags, weight_profile")
    .eq("disponibile", true);

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? data : [];
}

function mapMenuItem(raw = {}) {
  const weightProfile =
    raw.weight_profile ||
    raw.weightProfile ||
    (raw.categoria && normalize(raw.categoria).includes("leggera") ? "leggera" : null);

  return {
    id: raw.id || null,
    nome: raw.nome || raw.Nome || DEFAULT_PIZZA_FALLBACK.nome,
    categoria: raw.categoria || raw.Categoria || "pizza",
    prezzo: Number(raw.prezzo ?? raw.Prezzo ?? DEFAULT_PIZZA_FALLBACK.prezzo) || 0,
    ingredienti: Array.isArray(raw.ingredienti) ? raw.ingredienti : DEFAULT_PIZZA_FALLBACK.ingredienti,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    weight_profile: weightProfile
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

async function handlePizza(message, sessionId) {
  const userMessage = message || "";
  const intentType = routeIntent(userMessage, PANINO_WHITELIST);
  const parsedIntent = await interpretPizzaIntent(userMessage);
  let menu = [];

  try {
    menu = (await fetchMenu()).map(mapMenuItem);
  } catch (error) {
    console.error("[AI_ENGINE][MENU_ERROR]", { message: error.message });
    menu = [];
  }

  const availableMenu = menu.length ? menu : [DEFAULT_PIZZA_FALLBACK];
  let scoredMenu = availableMenu;

  if (intentType === "ingredient") {
    scoredMenu = availableMenu.map((pizza) => ({
      ...pizza,
      score: scorePizza(parsedIntent, pizza)
    }));
  } else if (intentType === "descriptive") {
    scoredMenu = scoreMenuByTags(userMessage, availableMenu);
  } else {
    scoredMenu = availableMenu.map((pizza) => ({ ...pizza, score: pizza.score ?? 0 }));
  }

  let candidate = pickRecommendation(scoredMenu, sessionId);

  if (!candidate) {
    // Fallback intelligente anti-loop
    const pool = scoredMenu.filter((item) => item.id !== lastSuggestedId);

    const usablePool = pool.length ? pool : scoredMenu;

    if (usablePool.length) {
      candidate = usablePool[Math.floor(Math.random() * usablePool.length)];
      lastSuggestedId = candidate?.id ?? lastSuggestedId;
    }
  }

  if (!candidate) {
    candidate = DEFAULT_PIZZA_FALLBACK;
  }

  const item = {
    id: candidate.id || null,
    nome: candidate.nome || candidate.Nome || DEFAULT_PIZZA_FALLBACK.nome,
    categoria: candidate.categoria || candidate.Categoria || "pizza",
    prezzo: Number(candidate.prezzo ?? candidate.Prezzo ?? DEFAULT_PIZZA_FALLBACK.prezzo) || 0,
    ingredienti: Array.isArray(candidate.ingredienti) ? candidate.ingredienti : DEFAULT_PIZZA_FALLBACK.ingredienti
  };

  const reply = await buildMarketingCopy(item, userMessage);

  return {
    ok: true,
    type: "pizza",
    reply,
    item
  };
}

async function buildMarketingCopy(item, originalMessage) {
  const fallback = `Ti consiglio la ${item.nome}, molto apprezzata dai nostri clienti.`;

  if (!openai) {
    return fallback;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "Sei un copywriter per una pizzeria. Raffina il testo, non cambiare il prodotto scelto. Massimo 40 parole, tono persuasivo ma conciso, in italiano. Non suggerire altri prodotti."
        },
        {
          role: "user",
          content: `Suggerisci ${item.nome} con ingredienti ${item.ingredienti.join(
            ", "
          )}. Contesto utente: ${originalMessage || "richiesta generica"}.`
        }
      ]
    });

    const text = completion.choices[0]?.message?.content?.trim();
    return text || fallback;
  } catch (error) {
    console.error("[AI_ENGINE][COPY_ERROR]", { message: error.message });
    return fallback;
  }
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

  const path = event?.path || "";
  if (path.includes("/ai-engine")) {
    return json(410, {
      ok: false,
      type: domain,
      reply: "Endpoint disabilitato. Usa /.netlify/functions/ai-orchestrator.",
      item: null
    });
  }

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, type: domain, reply: "Metodo non consentito", item: null });
  }

  try {
    const { message, sessionId: bodySessionId } = JSON.parse(event.body || "{}");
    domain = determineDomain(message || "");
    const sessionId = resolveSessionId(event.headers, bodySessionId);

    if (domain === "panino") {
      if (!message) {
        return json(400, { ok: false, type: domain, reply: "Devi indicare cosa vuoi ordinare.", item: null });
      }
      const response = await handlePanino(message);
      return json(200, response);
    }

    const response = await handlePizza(message || "", sessionId);
    return json(200, response);
  } catch (error) {
    console.error("[AI_ENGINE][UNCAUGHT]", { message: error.message, stack: error.stack });
    return json(500, { ok: false, type: domain, reply: "Servizio AI non disponibile al momento.", item: null });
  }
};
