/**
 * AL DOGE Orchestrator v2
 *
 * Architettura deterministica:
 * 1) Intent detection (rule-based)
 * 2) Decision engine su Supabase (fonte unica)
 * 3) Cross-sell deterministico
 * 4) OpenAI usata solo per copy persuasivo
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const { buildPanino } = require('../../core/panino/panino-engine');

const CATEGORY_KEYWORDS = {
  pizza: ["pizza", "pizze", "margherita", "diavola", "capricciosa"],
  panino: ["panino", "panini", "burger", "hamburger", "sandwich"],
  drink: ["drink", "bibita", "bibite", "bevanda", "bevande", "birra", "cola", "acqua"],
  fritto: ["fritto", "patatine", "crocchette", "olive", "arancini"],
};

const TAG_KEYWORDS = {
  piccante: ["piccante", "spicy", "diavola", "peperoncino"],
  vegetariana: ["vegetariana", "vegetariano", "veg"],
  gourmet: ["gourmet", "speciale", "premium", "ricercata", "ricercato"],
  classica: ["classica", "semplice", "tradizionale"],
};

const SUGGEST_TAG_KEYWORDS = {
  proteico: ["proteico", "proteina", "proteine", "bresaola", "pollo", "manzo", "tonno"],
  vegetariano: ["vegetariano", "vegetariana", "veg"],
  piccante: ["piccante", "spicy", "peperoncino"],
  premium: ["premium", "gourmet", "speciale", "ricercato", "ricercata"],
  leggero: ["leggero", "leggera", "light"],
};

const MAIN_CATEGORIES = new Set(["pizza", "panino"]);
const SIMPLE_CONFIRM_MESSAGES = new Set(["si", "sì", "ok", "va bene"]);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MENU_UPDATING_REPLY = "Al momento sto aggiornando il menu. Vuoi qualcosa di classico?";
const NO_MATCH_REPLY = "Non ho trovato una corrispondenza precisa. Vuoi qualcosa di classico o gourmet?";

class SupabaseUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "SupabaseUnavailableError";
  }
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function buildResponse({ ok, action = null, mainItem = null, upsell = null, reply }) {
  return { ok, action, mainItem, upsell, reply };
}

function normalizeText(input = "") {
  return String(input).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
}

function sanitizeText(input = "") {
  return String(input).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function isValidUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function detectCategory(text) {
  for (const [category, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => text.includes(w))) {
      return category;
    }
  }
  return null;
}

function detectTags(text) {
  const tags = [];
  for (const [tag, words] of Object.entries(TAG_KEYWORDS)) {
    if (words.some((w) => text.includes(w))) {
      tags.push(tag);
    }
  }
  return tags;
}

function detectIngredients(text) {
  const stop = new Set([
    "voglio", "vorrei", "una", "uno", "un", "con", "senza", "per", "che", "del", "della", "dello", "dei", "delle",
    "mi", "puoi", "potresti", "aggiungi", "metti", "dammi", "consiglia", "consigliami", "qualcosa", "di", "da", "il", "la", "le", "gli", "i",
    "al", "allo", "alla", "ai", "alle", "e", "o", "ma", "anche", "solo", "piu", "meno", "molto", "come", "tipo",
    "pizza", "panino", "drink", "fritto", "birra", "bevanda", "bibita",
  ]);

  const tokens = text
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !stop.has(t));

  return [...new Set(tokens)].slice(0, 8);
}

function extractPreferences(message = "") {
  const normalized = normalizeText(message);
  const category = normalized.includes("panino") ? "panino" : normalized.includes("pizza") ? "pizza" : null;
  const ingredientKeywords = detectIngredients(normalized);

  const tags = [];
  for (const [tag, words] of Object.entries(SUGGEST_TAG_KEYWORDS)) {
    if (words.some((word) => normalized.includes(word))) {
      tags.push(tag);
    }
  }

  return {
    category,
    keywords: ingredientKeywords,
    tags,
  };
}

function rankProductsByPreferences(products = [], preferences = { category: null, keywords: [], tags: [] }) {
  const normalizedCategory = preferences?.category ? normalizeText(preferences.category) : null;
  const desiredKeywords = Array.isArray(preferences?.keywords)
    ? preferences.keywords.map((keyword) => normalizeText(keyword)).filter(Boolean)
    : [];
  const desiredTags = Array.isArray(preferences?.tags)
    ? preferences.tags.map((tag) => normalizeText(tag)).filter(Boolean)
    : [];

  return products
    .map((product) => {
      const productIngredients = Array.isArray(product.ingredienti)
        ? product.ingredienti.map((ingredient) => normalizeText(ingredient))
        : [];
      const productTags = Array.isArray(product.tag) ? product.tag.map((tag) => normalizeText(tag)) : [];
      const productCategory = normalizeText(product.categoria || "");

      let score = 0;

      for (const keyword of desiredKeywords) {
        if (productIngredients.some((ingredient) => ingredient.includes(keyword) || keyword.includes(ingredient))) {
          score += 3;
        }
      }

      for (const tag of desiredTags) {
        if (productTags.includes(tag)) {
          score += 2;
        }
      }

      if (normalizedCategory && productCategory === normalizedCategory) {
        score += 1;
      }

      if (productTags.includes("premium")) {
        score += 1;
      }

      return { product, score };
    })
    .sort((a, b) => b.score - a.score || Number(a.product.prezzo) - Number(b.product.prezzo));
}

function buildSuggestDescription(message, preferences) {
  if (preferences?.tags?.length) {
    return `qualcosa di ${preferences.tags[0]}`;
  }
  if (preferences?.keywords?.length) {
    return `${preferences.keywords.join(", ")}`;
  }
  if (preferences?.category === "pizza") {
    return "una pizza";
  }
  if (preferences?.category === "panino") {
    return "un panino";
  }
  return sanitizeText(message) || "qualcosa di buono";
}

function detectIntent(rawMessage = "") {
  const text = normalizeText(rawMessage);

  const explicitAddPattern = /\b(aggiungi|metti|inserisci|ordina|prendo|prendi|mettilo|mettila|carrello|add to cart)\b/;
  const suggestPattern = /\b(consiglia|consigliami|suggerisci|proponi|cosa mi|cosa consigli|vorrei|voglio|ho voglia)\b/;
  const confirmUpsellPattern = /\b(si|sì|ok|va bene|aggiungi anche|prendo anche|confermo|perfetto)\b/;

  if (explicitAddPattern.test(text)) {
    return "ADD_EXPLICIT";
  }
  if (confirmUpsellPattern.test(text)) {
    return "CONFIRM_UPSELL";
  }
  if (suggestPattern.test(text)) {
    return "SUGGEST";
  }
  return "UNKNOWN";
}

function mapProduct(item) {
  return {
    id: item.id,
    nome: sanitizeText(item.nome || ""),
    prezzo: Number(item.prezzo) || 0,
    ingredienti: Array.isArray(item.ingredienti) ? item.ingredienti.map((x) => sanitizeText(x)).slice(0, 20) : [],
    categoria: sanitizeText(item.categoria || ""),
    tag: Array.isArray(item.tag) ? item.tag.map((x) => sanitizeText(x)) : [],
  };
}

function scoreProduct(item, desiredCategory, desiredTags, desiredIngredients) {
  let score = 0;

  if (desiredCategory && item.categoria === desiredCategory) {
    score += 4;
  }

  const itemTags = Array.isArray(item.tag) ? item.tag.map((t) => normalizeText(t)) : [];
  for (const wantedTag of desiredTags) {
    if (itemTags.includes(wantedTag)) {
      score += wantedTag === "gourmet" ? 3 : 2;
    }
  }

  const ingredienti = Array.isArray(item.ingredienti) ? item.ingredienti.map((i) => normalizeText(i)) : [];
  for (const ing of desiredIngredients) {
    if (ingredienti.some((x) => x.includes(ing) || ing.includes(x))) {
      score += 1;
    }
  }

  return score;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    throw new SupabaseUnavailableError(`Supabase fetch timeout/error: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function queryMenuItems({ categoria }) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new SupabaseUnavailableError("Missing Supabase configuration");
    }

    const url = new URL(`${SUPABASE_URL}/rest/v1/menu_items`);
    url.searchParams.set("select", "id,nome,prezzo,ingredienti,categoria,tag,disponibile");
    url.searchParams.set("disponibile", "eq.true");
    if (categoria) {
      url.searchParams.set("categoria", `eq.${categoria}`);
    }

    const res = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new SupabaseUnavailableError(`Supabase query failed: ${res.status} ${errText}`);
    }

    return await res.json();
  } catch (error) {
    if (error instanceof SupabaseUnavailableError) {
      throw error;
    }
    throw new SupabaseUnavailableError(`Supabase query error: ${error.message}`);
  }
}

async function getMenuItemById(id) {
  if (!isValidUuid(id)) {
    return null;
  }

  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/menu_items`);
    url.searchParams.set("select", "id,nome,prezzo,ingredienti,categoria,tag,disponibile");
    url.searchParams.set("id", `eq.${id}`);
    url.searchParams.set("disponibile", "eq.true");
    url.searchParams.set("limit", "1");

    const res = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new SupabaseUnavailableError(`Supabase item lookup failed: ${res.status} ${errText}`);
    }

    const rows = await res.json();
    return rows?.[0] ? mapProduct(rows[0]) : null;
  } catch (error) {
    if (error instanceof SupabaseUnavailableError) {
      throw error;
    }
    throw new SupabaseUnavailableError(`Supabase item lookup error: ${error.message}`);
  }
}

async function matchProduct(rawMessage) {
  const text = normalizeText(rawMessage);
  const desiredCategory = detectCategory(text);
  const desiredTags = detectTags(text);
  const desiredIngredients = detectIngredients(text);

  const allItems = await queryMenuItems({ categoria: undefined });
  if (!allItems || allItems.length === 0) {
    return null;
  }

  const categoryItems = desiredCategory ? allItems.filter((item) => item.categoria === desiredCategory) : [];
  const candidates = categoryItems.length > 0 ? categoryItems : allItems;

  const ranked = candidates
    .map((item) => ({ item, score: scoreProduct(item, desiredCategory, desiredTags, desiredIngredients) }))
    .sort((a, b) => b.score - a.score || Number(a.item.prezzo) - Number(b.item.prezzo));

  if (!ranked[0]) {
    return null;
  }

  if (ranked[0].score <= 0) {
    if (categoryItems.length > 0) {
      return mapProduct(categoryItems[0]);
    }

    const cheapest = allItems.slice().sort((a, b) => Number(a.prezzo) - Number(b.prezzo))[0];
    return cheapest ? mapProduct(cheapest) : null;
  }

  return mapProduct(ranked[0].item);
}

async function fetchUpsellByCategory(category) {
  const items = await queryMenuItems({ categoria: category });
  if (!items || items.length === 0) {
    return null;
  }

  const sorted = items.slice().sort((a, b) => Number(a.prezzo) - Number(b.prezzo));
  const pick = sorted[0];

  return {
    id: pick.id,
    nome: sanitizeText(pick.nome || ""),
    categoria: sanitizeText(pick.categoria || ""),
  };
}

async function computeDrinkUpsell(mainItem) {
  if (!mainItem) {
    return null;
  }

  const tags = Array.isArray(mainItem.tag) ? mainItem.tag.map((t) => normalizeText(t)) : [];

  if (mainItem.categoria === "pizza" && tags.includes("piccante")) {
    return fetchUpsellByCategory("drink");
  }

  if (mainItem.categoria === "panino") {
    return fetchUpsellByCategory("drink");
  }

  return null;
}

async function computeFrittoUpsell(mainItem) {
  if (!mainItem) {
    return null;
  }

  if (MAIN_CATEGORIES.has(mainItem.categoria)) {
    return fetchUpsellByCategory("fritto");
  }

  return null;
}

async function computeUpsell(mainItem, sessionState = {}) {
  if (!mainItem) {
    return null;
  }

  if (sessionState?.drinkOffered || sessionState?.lastUpsellCategory === "drink") {
    return computeFrittoUpsell(mainItem);
  }

  const drinkUpsell = await computeDrinkUpsell(mainItem);
  if (drinkUpsell) {
    return drinkUpsell;
  }

  return computeFrittoUpsell(mainItem);
}

function safeSessionState(input) {
  const value = input && typeof input === "object" ? input : {};
  const validLastMainItemId = isValidUuid(value.lastMainItemId) ? value.lastMainItemId : null;
  const validLastUpsellId = isValidUuid(value.lastUpsellId) ? value.lastUpsellId : null;

  return {
    lastMainItemId: validLastMainItemId,
    lastUpsellId: validLastUpsellId,
    lastUpsellCategory: typeof value.lastUpsellCategory === "string" ? normalizeText(value.lastUpsellCategory) : null,
    awaitingUpsellConfirmation: value.awaitingUpsellConfirmation === true,
    drinkOffered: value.drinkOffered === true,
  };
}

function dynamicFallbackCopy(mainItem, upsell) {
  return `Ottima scelta: ${mainItem.nome} a €${Number(mainItem.prezzo) || 0}.${upsell ? ` Vuoi aggiungere anche ${upsell.nome}?` : ""}`;
}

async function generatePersuasiveCopy(mainItem, upsell) {
  if (!OPENAI_API_KEY) {
    return dynamicFallbackCopy(mainItem, upsell);
  }

  const safeIngredients = (Array.isArray(mainItem.ingredienti) ? mainItem.ingredienti : [])
    .map((ing) => sanitizeText(ing))
    .filter(Boolean)
    .slice(0, 10);

  const system = "Sei una cameriera AI. Scrivi solo una risposta breve (max 2 frasi), naturale e persuasiva in italiano.";
  const user = [
    `Prodotto principale: ${sanitizeText(mainItem.nome)}`,
    `Prezzo: €${Number(mainItem.prezzo) || 0}`,
    `Ingredienti: ${safeIngredients.join(", ") || "n/d"}`,
    `Upsell: ${upsell ? `${sanitizeText(upsell.nome)} (${sanitizeText(upsell.categoria)})` : "nessuno"}`,
    "Niente JSON. Solo testo finale per cliente.",
  ].join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.6,
        max_tokens: 120,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      return dynamicFallbackCopy(mainItem, upsell);
    }

    const data = await res.json();
    return sanitizeText(data?.choices?.[0]?.message?.content || "") || dynamicFallbackCopy(mainItem, upsell);
  } catch (_error) {
    return dynamicFallbackCopy(mainItem, upsell);
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(200, buildResponse({ ok: false, action: null, mainItem: null, upsell: null, reply: "Metodo non consentito." }));
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const message = String(body.message || "").trim();
    const sessionState = safeSessionState(body.sessionState);
    const normalizedMessage = normalizeText(message);

    if (!message) {
      return json(200, buildResponse({ ok: false, action: null, mainItem: null, upsell: null, reply: NO_MATCH_REPLY }));
    }

    const rawIntent = detectIntent(message);
    const intent = rawIntent === "UNKNOWN" ? "SUGGEST" : rawIntent;
    console.log("[AI_INTENT]", intent);

    if (rawIntent === "CONFIRM_UPSELL" && SIMPLE_CONFIRM_MESSAGES.has(normalizedMessage) && !sessionState.awaitingUpsellConfirmation) {
      return json(200, buildResponse({ ok: false, action: null, mainItem: null, upsell: null, reply: "Perfetto. Vuoi che ti proponga qualcosa di specifico?" }));
    }

    if (rawIntent === "CONFIRM_UPSELL" && sessionState.awaitingUpsellConfirmation && sessionState.lastUpsellId) {
      let upsellAsMain;
      let parentMainItem;

      try {
        upsellAsMain = await getMenuItemById(sessionState.lastUpsellId);
        parentMainItem = await getMenuItemById(sessionState.lastMainItemId);
      } catch (error) {
        if (error instanceof SupabaseUnavailableError) {
          return json(200, buildResponse({ ok: false, action: null, mainItem: null, upsell: null, reply: MENU_UPDATING_REPLY }));
        }
        throw error;
      }

      if (!upsellAsMain) {
        return json(200, buildResponse({ ok: false, action: null, mainItem: null, upsell: null, reply: "Perfetto. Vuoi che ti proponga qualcosa di specifico?" }));
      }

      const nextUpsell = parentMainItem
        ? await computeUpsell(parentMainItem, {
          ...sessionState,
          awaitingUpsellConfirmation: false,
          drinkOffered: true,
          lastUpsellCategory: upsellAsMain.categoria,
        })
        : null;

      const reply = await generatePersuasiveCopy(upsellAsMain, nextUpsell);
      console.log("[AI_MAIN]", upsellAsMain?.id || null);
      console.log("[AI_UPSELL]", nextUpsell?.id || null);

      return json(200, buildResponse({
        ok: true,
        action: "add_to_cart",
        mainItem: {
          id: upsellAsMain.id,
          nome: upsellAsMain.nome,
          prezzo: Number(upsellAsMain.prezzo) || 0,
          ingredienti: upsellAsMain.ingredienti,
          categoria: upsellAsMain.categoria,
        },
        upsell: nextUpsell,
        reply,
      }));
    }

    // Conferma semplice dopo proposta
    if (/^(sì|si|ok|va bene|aggiungi)$/i.test(message.trim()) && sessionState?.lastMainItemId) {
      let confirmedMainItem;

      try {
        confirmedMainItem = await getMenuItemById(sessionState.lastMainItemId);
      } catch (error) {
        if (error instanceof SupabaseUnavailableError) {
          return json(200, buildResponse({ ok: false, action: null, mainItem: null, upsell: null, reply: MENU_UPDATING_REPLY }));
        }
        throw error;
      }

      if (!confirmedMainItem) {
        return json(200, buildResponse({ ok: false, action: null, mainItem: null, upsell: null, reply: NO_MATCH_REPLY }));
      }

      return json(200, buildResponse({
        ok: true,
        action: "add_to_cart",
        mainItem: {
          id: confirmedMainItem.id,
          nome: confirmedMainItem.nome,
          prezzo: Number(confirmedMainItem.prezzo) || 0,
          ingredienti: confirmedMainItem.ingredienti,
          categoria: confirmedMainItem.categoria,
        },
        upsell: null,
        reply: `Perfetto, aggiungo ${confirmedMainItem.nome} al carrello.`,
      }));
    }

    if (intent === "SUGGEST") {
      let menuItems;
      try {
        menuItems = await queryMenuItems({ categoria: undefined });
      } catch (error) {
        if (error instanceof SupabaseUnavailableError) {
          return json(200, buildResponse({ ok: false, action: null, mainItem: null, upsell: null, reply: MENU_UPDATING_REPLY }));
        }
        throw error;
      }

      if (!menuItems || menuItems.length === 0) {
        return json(200, buildResponse({ ok: false, action: null, mainItem: null, upsell: null, reply: NO_MATCH_REPLY }));
      }

      const preferences = extractPreferences(message);
      const mappedItems = menuItems.map((item) => mapProduct(item));
      let picks = [];

      if (preferences.category) {
        const filtered = mappedItems.filter((item) => item.categoria === preferences.category);
        picks = rankProductsByPreferences(filtered, preferences).map((entry) => entry.product).slice(0, 2);
      } else {
        const ranked = rankProductsByPreferences(mappedItems, preferences);
        const topPizza = ranked.find((entry) => entry.product.categoria === "pizza")?.product || null;
        const topPanino = ranked.find((entry) => entry.product.categoria === "panino")?.product || null;

        if (topPizza && topPanino) {
          picks = [topPizza, topPanino];
        } else {
          picks = ranked.slice(0, 2).map((entry) => entry.product);
        }
      }

      if (picks.length === 0) {
        return json(200, buildResponse({ ok: false, action: null, mainItem: null, upsell: null, reply: NO_MATCH_REPLY }));
      }

      const first = picks[0];
      const second = picks[1] || picks[0];
      const description = buildSuggestDescription(message, preferences);
      const reply = `Se cerchi ${description} ti consiglio:
1️⃣ ${first.nome}
2️⃣ ${second.nome}
Vuoi che ne aggiunga uno al carrello?`;

      console.log("[AI_MAIN]", first?.id || null);
      console.log("[AI_UPSELL]", null);

      return json(200, buildResponse({
        ok: true,
        action: null,
        mainItem: null,
        upsell: null,
        reply,
      }));
    }

    let mainItem;
    try {
      mainItem = await matchProduct(message);
    } catch (error) {
      if (error instanceof SupabaseUnavailableError) {
        return json(200, buildResponse({ ok: false, action: null, mainItem: null, upsell: null, reply: MENU_UPDATING_REPLY }));
      }
      throw error;
    }

    if (!mainItem) {
      return json(200, buildResponse({ ok: false, action: null, mainItem: null, upsell: null, reply: NO_MATCH_REPLY }));
    }

    let upsell;
    try {
      upsell = await computeUpsell(mainItem, sessionState);
    } catch (error) {
      if (error instanceof SupabaseUnavailableError) {
        return json(200, buildResponse({ ok: false, action: null, mainItem: null, upsell: null, reply: MENU_UPDATING_REPLY }));
      }
      throw error;
    }

    const action = rawIntent === "ADD_EXPLICIT" ? "add_to_cart" : null;

    if (!action) {
      const reply = `Ti propongo ${mainItem.nome}. Vuoi che la aggiunga al carrello?`;

      return json(200, buildResponse({
        ok: true,
        action: null,
        mainItem: {
          id: mainItem.id,
          nome: mainItem.nome,
          prezzo: Number(mainItem.prezzo) || 0,
          ingredienti: mainItem.ingredienti,
          categoria: mainItem.categoria,
        },
        upsell: null,
        reply,
      }));
    }

    const reply = await generatePersuasiveCopy(mainItem, upsell);

    if (action === "add_to_cart") {
      console.log("[AI_MAIN]", mainItem?.id || null);
    }
    console.log("[AI_UPSELL]", upsell?.id || null);

    return json(200, buildResponse({
      ok: true,
      action,
      mainItem: {
        id: mainItem.id,
        nome: mainItem.nome,
        prezzo: Number(mainItem.prezzo) || 0,
        ingredienti: mainItem.ingredienti,
        categoria: mainItem.categoria,
      },
      upsell,
      reply,
    }));
  } catch (error) {
    console.error("orchestrator-v2 error:", error);
    return json(200, buildResponse({ ok: false, action: null, mainItem: null, upsell: null, reply: NO_MATCH_REPLY }));
  }
};

// Export per test locali / debugging.
module.exports = {
  ...module.exports,
  detectIntent,
  extractPreferences,
  rankProductsByPreferences,
  matchProduct,
  computeUpsell,
  computeDrinkUpsell,
  computeFrittoUpsell,
  safeSessionState,
  isValidUuid,
};
