const OpenAI = require('openai');
const catalog = require('../../data/catalog');
const { validateResponse, FALLBACK_RESPONSE } = require('./orchestrator-v3/contract-validator');
const { routeDomain } = require('./orchestrator-v3/domain-router');
const { handleMenu, findPizza, parseQty } = require('./orchestrator-v3/menu-handler');
const { handlePanino } = require('./orchestrator-v3/panino-handler');
const { logExecution } = require('./orchestrator-v3/logger');
const {
  AddItemSchema,
  RemoveItemSchema,
  CreateCustomItemSchema,
  SuggestItemsSchema,
  parseWith,
  toToolParameters,
  normalizeIngredientId,
  VALID_INGREDIENTS
} = require('./orchestrator-v3/schemas/orderSchemas');
const { buildOrderItem, CATALOG_ITEMS } = require('./orchestrator-v3/services/orderBuilder');
const {
  extractValidIngredients,
  extractExcludedIngredients
} = require('./orchestrator-v3/services/ingredientExtractor');
const { findBestMatches } = require('./orchestrator-v3/services/ingredientMatchEngine');
const { extractIngredientsByCategory } = require('./orchestrator-v3/services/customIngredientParser');

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const PRIMARY_RECOMMENDATION_TOKENS = [
  'consigli',
  'consiglio',
  'consigliami',
  'qualcosa',
  'leggera',
  'piccante',
  'vegetariana',
  'non so',
  'cosa prendere'
];
const SECONDARY_RECOMMENDATION_TOKENS = [...PRIMARY_RECOMMENDATION_TOKENS, 'senza', 'con'];
const PRIMARY_RECOMMENDATION_REGEX = new RegExp(
  `\\b(${PRIMARY_RECOMMENDATION_TOKENS.join('|')})\\b`,
  'i'
);
const RECOMMENDATION_REGEX = new RegExp(
  `\\b(${SECONDARY_RECOMMENDATION_TOKENS.join('|')})\\b`,
  'i'
);
const PICCANTE_TOKEN = 'piccante';
const LLM_TIMEOUT_MS = 12000;
const DEFAULT_RECOMMENDATION_SCORE = 1;
const RECOMMENDATION_WEIGHTS = Object.freeze({
  explicitIngredientMatch: 6,
  missingIngredientPenalty: -4,
  piccantePreference: 3,
  vegetarianaPreference: 3,
  leggeraPreference: 2,
  genericBase: 1,
  typeBalanceBoost: 1,
  sameTypePenaltyWhenGeneric: -1
});
const DRINK_KEYWORDS = ['bevanda', 'bibita', 'drink', 'birra', 'acqua', 'coca'];
const SANDWICH_KEYWORDS = ['panino', 'panini', 'sandwich'];
const PIZZA_KEYWORDS = ['pizza', 'pizze'];

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload)
  };
}

function parseBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body === 'object') {
    return body;
  }

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function parseArgs(args) {
  if (!args) return {};
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      return {};
    }
  }
  return args;
}

function enrichWithLegacyFields(response, typeHint) {
  if (!response || typeof response !== 'object') {
    return response;
  }

  const enriched = { ...response };
  if (typeHint && !enriched.type) {
    enriched.type = typeHint.toLowerCase();
  }

  const firstUpdate = Array.isArray(enriched.cartUpdates) ? enriched.cartUpdates[0] : null;
  if (firstUpdate && !enriched.item) {
    enriched.item = {
      nome: firstUpdate.name || firstUpdate.id,
      ingredienti: Array.isArray(firstUpdate.ingredients) ? firstUpdate.ingredients : [],
      prezzo: typeof firstUpdate.price === 'number' ? firstUpdate.price : Number(firstUpdate.price) || 0,
      qty: firstUpdate.qty
    };
  }

  return enriched;
}

function buildCustomPizzaFromIngredients({ ingredients, message }) {
  const baseItem = CATALOG_ITEMS.get('margherita') || Array.from(CATALOG_ITEMS.values())[0];
  if (!baseItem) {
    return null;
  }

  const normalizedMessage = String(message || '').toLowerCase();
  const includeTomatoBase = !normalizedMessage.includes('bianca');
  const desiredIngredients = new Set(
    (ingredients || []).map((ingredient) => normalizeIngredientId(ingredient)).filter(Boolean)
  );

  if (includeTomatoBase) {
    desiredIngredients.add('pomodoro');
  } else {
    desiredIngredients.delete('pomodoro');
  }

  const baseIngredients = [
    ...(Array.isArray(baseItem.ingredients) ? baseItem.ingredients : []),
    ...(Array.isArray(baseItem.ingredienti) ? baseItem.ingredienti : [])
  ]
    .map(normalizeIngredientId)
    .filter(Boolean);

  const removedIngredients = baseIngredients.filter((ingredient) => !desiredIngredients.has(ingredient));
  const extraIngredients = Array.from(desiredIngredients).filter(
    (ingredient) => !baseIngredients.includes(ingredient)
  );

  const orderItem = buildOrderItem({
    baseItem,
    extraIngredients,
    removedIngredients,
    quantity: 1
  });

  const ingredientList = orderItem.ingredients.join(', ');
  return enrichWithLegacyFields(
    {
      ok: true,
      cartUpdates: [orderItem],
      reply: `Ho creato una pizza personalizzata con ${ingredientList}.`
    },
    'pizza'
  );
}

function runDeterministicIngredientMatch(message) {
  const knownIngredients = Array.from(VALID_INGREDIENTS);
  const parsed = extractIngredientsByCategory({
    message,
    knownIngredients,
    allowedIngredients: knownIngredients
  });
  const ingredients = (parsed.recognizedIngredients || [])
    .map((ingredient) => normalizeIngredientId(ingredient))
    .filter(Boolean);

  if (ingredients.length === 0) {
    const normalizedMessage = String(parsed.normalizedMessage || '').trim();
    const isPizzaCustomRequest =
      /\bpizza\b/i.test(normalizedMessage) && /\b(con|senza|personalizzat|aggiungi|metti|voglio|vorrei|fammi)\b/i.test(normalizedMessage);

    if (isPizzaCustomRequest || normalizedMessage === 'pizza') {
      return enrichWithLegacyFields(
        {
          ok: true,
          cartUpdates: [],
          reply: 'Per personalizzare la pizza indicami almeno un ingrediente valido.'
        },
        'pizza'
      );
    }

    return null;
  }

  const matches = findBestMatches(ingredients, Array.from(CATALOG_ITEMS.values()));

  if (matches.identical) {
    const orderItem = buildOrderItem({
      baseItem: matches.identical,
      extraIngredients: [],
      removedIngredients: [],
      quantity: 1
    });

    return enrichWithLegacyFields(
      {
        ok: true,
        cartUpdates: [orderItem],
        reply: `${orderItem.name} aggiunta al carrello (${orderItem.qty}x).`
      },
      'pizza'
    );
  }

  if (Array.isArray(matches.similar) && matches.similar.length > 0) {
    return enrichWithLegacyFields(
      {
        ok: true,
        cartUpdates: [],
        reply: 'Non esiste esattamente questa combinazione. Ti propongo:',
        suggestions: matches.similar.map((pizza) => pizza.name || pizza.id).filter(Boolean)
      },
      'pizza'
    );
  }

  return buildCustomPizzaFromIngredients({ ingredients, message });
}

function detectRecommendationIntent(message, domain) {
  if (!message) {
    return false;
  }

  if (domain && domain !== 'MENU') {
    return false;
  }

  const normalizedMessage = String(message);
  const hasPrimaryToken = PRIMARY_RECOMMENDATION_REGEX.test(normalizedMessage);
  const hasQuestionTone = normalizedMessage.includes('?');
  const hasExclusionToken = normalizedMessage.includes('senza');
  const genericAsk = /\b(non so|cosa prendere|scegli tu|sorpresa)\b/i.test(normalizedMessage);

  if (!RECOMMENDATION_REGEX.test(normalizedMessage)) {
    return false;
  }

  return hasPrimaryToken || hasQuestionTone || hasExclusionToken || genericAsk;
}

function normalizeCatalogIngredients(item) {
  return [
    ...(Array.isArray(item?.ingredients) ? item.ingredients : []),
    ...(Array.isArray(item?.ingredienti) ? item.ingredienti : [])
  ]
    .map(normalizeIngredientId)
    .filter(Boolean);
}

function getRecommendationCatalogItems() {
  const buckets = [
    Array.from(CATALOG_ITEMS.values()),
    ...(Array.isArray(catalog?.drinks) ? [catalog.drinks] : []),
    ...(Array.isArray(catalog?.bevande) ? [catalog.bevande] : []),
    ...(Array.isArray(catalog?.panini) ? [catalog.panini] : []),
    ...(Array.isArray(catalog?.panino_al_doge) ? [catalog.panino_al_doge] : [])
  ];

  const deduped = new Map();
  buckets.flat().forEach((item) => {
    if (!item || item.active === false || !item.id) return;
    deduped.set(String(item.id), item);
  });

  return Array.from(deduped.values());
}

function detectTypeIntent(normalizedMessage) {
  const wantsPizza = PIZZA_KEYWORDS.some((token) => normalizedMessage.includes(token));
  const wantsPanino = SANDWICH_KEYWORDS.some((token) => normalizedMessage.includes(token));
  const wantsDrink = DRINK_KEYWORDS.some((token) => normalizedMessage.includes(token));

  return {
    wantsPizza,
    wantsPanino,
    wantsDrink,
    asksCombo: wantsDrink && (wantsPizza || wantsPanino)
  };
}

function normalizeType(item) {
  const raw = String(item?.type || item?.categoria || '').toLowerCase();
  if (raw.includes('drink') || raw.includes('bevand') || raw.includes('bibit')) return 'drink';
  if (raw.includes('panino') || raw.includes('sandwich')) return 'panino';
  if (raw.includes('pizza') || raw.includes('pizz')) return 'pizza';
  return 'pizza';
}

function messageHash(value) {
  const input = String(value || '');
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) % 997;
  }
  return hash;
}

function extractFreeformPreferenceIngredients(normalizedMessage) {
  const match = normalizedMessage.match(/\bcon\s+([a-zàèéìòù'\s]{2,40})/i);
  if (!match) {
    return [];
  }

  return match[1]
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token && !['e', 'o', 'una', 'un', 'di', 'da', 'per', 'la', 'il', 'lo'].includes(token));
}

function buildRecommendationResponse(message) {
  const normalizedMessage = String(message || '').toLowerCase();
  const wantsPiccante = normalizedMessage.includes(PICCANTE_TOKEN);
  const wantsVegetariana = normalizedMessage.includes('vegetar');
  const wantsLeggera = normalizedMessage.includes('legger');
  const typeIntent = detectTypeIntent(normalizedMessage);
  const desiredIngredients = extractValidIngredients(message);
  const excludedIngredients = extractExcludedIngredients(message);
  const desiredWithoutExcluded = desiredIngredients.filter(
    (ingredient) => !excludedIngredients.includes(ingredient)
  );
  const explicitTextIngredients = extractFreeformPreferenceIngredients(normalizedMessage);
  const ingredientSignals =
    desiredWithoutExcluded.length > 0 ? desiredWithoutExcluded : explicitTextIngredients;
  const ingredientBasedRequest = ingredientSignals.length > 0;
  const catalogItems = getRecommendationCatalogItems();
  const typeCount = catalogItems.reduce((acc, item) => {
    const type = normalizeType(item);
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  if (catalogItems.length === 0) {
    return null;
  }

  const scored = catalogItems.map((item) => {
    const ingredients = normalizeCatalogIngredients(item);
    const tags = Array.isArray(item?.tags)
      ? item.tags.map((tag) => String(tag).toLowerCase())
      : Array.isArray(item?.tag)
        ? item.tag.map((tag) => String(tag).toLowerCase())
        : [];
    const itemType = normalizeType(item);
    const ingredientMatches = ingredientSignals.filter((ingredient) => ingredients.includes(ingredient));
    const excludedMatches = excludedIngredients.filter((ingredient) => ingredients.includes(ingredient));

    if (excludedMatches.length > 0) {
      return {
        item,
        score: Number.NEGATIVE_INFINITY,
        reason: `Esclusa: contiene ${excludedMatches.join(', ')}`,
        price: Number(item?.price_cents ?? item?.price ?? item?.base_price_cents ?? 0) || 0
      };
    }

    let score = 0;
    const reasonParts = [];

    if (typeIntent.wantsPizza && itemType === 'pizza') {
      score += 2;
      reasonParts.push('In linea con richiesta pizza');
    }

    if (typeIntent.wantsPanino && itemType === 'panino') {
      score += 2;
      reasonParts.push('In linea con richiesta panino');
    }

    if (typeIntent.wantsDrink && itemType === 'drink') {
      score += 2;
      reasonParts.push('In linea con richiesta bibita');
    }

    if (!typeIntent.wantsPizza && !typeIntent.wantsPanino && !typeIntent.wantsDrink) {
      const bucketSize = typeCount[itemType] || 1;
      score += RECOMMENDATION_WEIGHTS.typeBalanceBoost / bucketSize;
      if (itemType === 'pizza') {
        score += RECOMMENDATION_WEIGHTS.sameTypePenaltyWhenGeneric;
      }
    }

    if (ingredientMatches.length > 0) {
      score += ingredientMatches.length * RECOMMENDATION_WEIGHTS.explicitIngredientMatch;
      reasonParts.push(`Contiene ${ingredientMatches.join(', ')}`);
    } else if (ingredientBasedRequest) {
      score += RECOMMENDATION_WEIGHTS.missingIngredientPenalty;
      reasonParts.push('Manca ingrediente richiesto');
    }

    const hasPiccante =
      tags.some((tag) => tag.includes(PICCANTE_TOKEN)) ||
      ingredients.some((id) => id.includes(PICCANTE_TOKEN));
    if (wantsPiccante && hasPiccante) {
      score += RECOMMENDATION_WEIGHTS.piccantePreference;
      reasonParts.push('Nota piccante');
    }

    const hasVegetariana =
      tags.some((tag) => tag.includes('vegetar')) ||
      (ingredients.length > 0 &&
        !ingredients.some((ingredient) =>
          /(salame|prosciutto|speck|tonno|salsiccia)/i.test(ingredient)
        ));
    if (wantsVegetariana && hasVegetariana) {
      score += RECOMMENDATION_WEIGHTS.vegetarianaPreference;
      reasonParts.push('Opzione vegetariana');
    }

    if (wantsLeggera && ingredients.length <= 3) {
      score += RECOMMENDATION_WEIGHTS.leggeraPreference;
      reasonParts.push('Leggera con pochi ingredienti');
    }

    if (score <= 0 && !ingredientBasedRequest) {
      score = DEFAULT_RECOMMENDATION_SCORE * RECOMMENDATION_WEIGHTS.genericBase;
      reasonParts.push('Buon punto di partenza');
    }

    const price = Number(item?.price_cents ?? item?.price ?? item?.base_price_cents ?? 0) || 0;

    return {
      item,
      score,
      itemType,
      reason: reasonParts.join('. ') || 'Scelta dal menu',
      price
    };
  });

  const scoredWithoutExcluded = scored.filter((entry) => Number.isFinite(entry.score));
  const hasIngredientMatch = scoredWithoutExcluded.some((entry) => /Contiene /.test(entry.reason));

  if (ingredientBasedRequest && !hasIngredientMatch) {
    const ingredientList = ingredientSignals.join(', ');
    const sortedByPrice = scoredWithoutExcluded.slice().sort((a, b) => a.price - b.price);
    const fallbackEntries = [];
    const fallbackPizza = sortedByPrice.find((entry) => normalizeType(entry.item) === 'pizza');
    const fallbackDrink = sortedByPrice.find((entry) => normalizeType(entry.item) === 'drink');
    if (fallbackPizza) fallbackEntries.push(fallbackPizza);
    if (fallbackDrink) fallbackEntries.push(fallbackDrink);

    sortedByPrice.forEach((entry) => {
      if (fallbackEntries.length >= 2) return;
      if (!fallbackEntries.some((selected) => selected.item.id === entry.item.id)) {
        fallbackEntries.push(entry);
      }
    });

    const genericTop = fallbackEntries.map(({ item }) => ({
      id: String(item.id),
      name: String(item.name || item.id),
      reason: 'Alternativa vicina in catalogo'
    }));

    return {
      ok: true,
      mode: 'recommendation',
      cartUpdates: [],
      suggestions: genericTop,
      reply:
        genericTop.length > 0
          ? `Non vedo opzioni con ${ingredientList} nel catalogo attuale. Posso proporti ${genericTop
              .map((item) => item.name)
              .join(' oppure ')} come alternative valide.`
          : `Non vedo opzioni con ${ingredientList} nel catalogo attuale.`,
      type: 'pizza'
    };
  }

  const scoredWithPositive = scoredWithoutExcluded.filter((entry) => entry.score > 0);
  const candidates = scoredWithPositive.length > 0 ? scoredWithPositive : scoredWithoutExcluded;

  const messageSeed = messageHash(normalizedMessage);
  const sorted = candidates
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const diversityA = (messageSeed + messageHash(a.item?.id)) % 7;
      const diversityB = (messageSeed + messageHash(b.item?.id)) % 7;
      if (diversityA !== diversityB) {
        return diversityB - diversityA;
      }
      return a.price - b.price;
    });

  const top = [];
  if (typeIntent.asksCombo) {
    const bestPizzaOrPanino = sorted.find((entry) =>
      typeIntent.wantsPanino ? entry.itemType === 'panino' : entry.itemType === 'pizza'
    );
    const bestDrink = sorted.find((entry) => entry.itemType === 'drink');
    if (bestPizzaOrPanino) top.push(bestPizzaOrPanino);
    if (bestDrink) top.push(bestDrink);
  }

  sorted.forEach((entry) => {
    if (top.length >= 3) return;
    if (!top.some((selected) => selected.item.id === entry.item.id)) {
      top.push(entry);
    }
  });

  if (top.length === 0) {
    return null;
  }

  const suggestions = top.map(({ item, reason }) => ({
    id: String(item.id),
    name: String(item.name || item.id),
    reason: reason || 'Scelta dal menu'
  }));

  const names = suggestions.map((suggestion) => suggestion.name);
  const reply = `Ti consiglio ${names.join(' oppure ')}. Dimmi quale vuoi aggiungere al carrello.`;

  return {
    ok: true,
    mode: 'recommendation',
    cartUpdates: [],
    suggestions,
    reply,
    type: 'pizza'
  };
}

function runExactNameMatch(message, domain) {
  if (domain && domain !== 'MENU') {
    return null;
  }

  const pizza = findPizza(message);
  if (!pizza) {
    return null;
  }

  const qty = parseQty(message);
  const baseItem = CATALOG_ITEMS.get(String(pizza.id)) || pizza;

  try {
    const orderItem = buildOrderItem({
      baseItem,
      extraIngredients: [],
      removedIngredients: [],
      quantity: qty
    });

    return enrichWithLegacyFields(
      {
        ok: true,
        cartUpdates: [orderItem],
        reply: `${orderItem.name} aggiunta al carrello (${orderItem.qty}x).`
      },
      'pizza'
    );
  } catch {
    return null;
  }
}

function runDirectMatch(message) {
  const { domain, intent } = routeDomain(message);

  if (domain === 'MENU') {
    const directMenuResponse = handleMenu({ message, intent });
    if (directMenuResponse?.ok && directMenuResponse.cartUpdates?.length) {
      return directMenuResponse;
    }
  }

  if (domain === 'PANINO') {
    const directPaninoResponse = handlePanino({ message, intent });
    if (directPaninoResponse?.ok && directPaninoResponse.cartUpdates?.length) {
      return directPaninoResponse;
    }
  }

  return null;
}

const TOOL_CONFIG = {
  add_item: {
    schema: AddItemSchema,
    parameters: toToolParameters('add'),
    executor: (data) => {
      const baseItem = CATALOG_ITEMS.get(String(data.itemId));
      if (!baseItem) {
        return { ok: false, error: 'INVALID_TOOL_PAYLOAD' };
      }

      let orderItem;
      try {
        orderItem = buildOrderItem({
          baseItem,
          extraIngredients: data.extraIngredients || [],
          removedIngredients: data.removedIngredients || [],
          quantity: data.quantity
        });
      } catch {
        return { ok: false, error: 'INVALID_TOOL_PAYLOAD' };
      }

      return {
        ok: true,
        cartUpdates: [orderItem],
        reply: `${orderItem.name} aggiunta al carrello (${orderItem.qty}x).`,
        type: 'pizza',
        item: {
          nome: orderItem.name,
          ingredienti: orderItem.ingredients,
          prezzo: orderItem.price,
          qty: orderItem.qty
        }
      };
    }
  },
  remove_item: {
    schema: RemoveItemSchema,
    parameters: toToolParameters('remove'),
    executor: (data) => {
      if (!CATALOG_ITEMS.has(String(data.itemId))) {
        return { ok: false, error: 'INVALID_TOOL_PAYLOAD' };
      }

      return {
        ok: true,
        cartUpdates: [
          {
            type: 'REMOVE_ITEM',
            id: String(data.itemId),
            qty: data.quantity
          }
        ],
        reply: `Rimosso ${data.quantity}x ${data.itemId} dal carrello.`,
        type: 'pizza'
      };
    }
  },
  create_custom_item: {
    schema: CreateCustomItemSchema,
    parameters: toToolParameters('custom'),
    executor: (data) => {
      const baseItem = CATALOG_ITEMS.get(String(data.baseItemId));
      if (!baseItem) {
        return { ok: false, error: 'INVALID_TOOL_PAYLOAD' };
      }

      let orderItem;
      try {
        orderItem = buildOrderItem({
          baseItem,
          extraIngredients: data.extraIngredients || [],
          removedIngredients: data.removedIngredients || [],
          quantity: data.quantity
        });
      } catch {
        return { ok: false, error: 'INVALID_TOOL_PAYLOAD' };
      }

      return {
        ok: true,
        cartUpdates: [orderItem],
        reply: `Creato articolo personalizzato (${orderItem.qty}x ${orderItem.name}).`,
        type: 'pizza',
        item: {
          nome: orderItem.name,
          ingredienti: orderItem.ingredients,
          prezzo: orderItem.price,
          qty: orderItem.qty
        }
      };
    }
  },
  suggest_items: {
    schema: SuggestItemsSchema,
    parameters: toToolParameters('suggest'),
    executor: (data) => {
      const items = Array.from(CATALOG_ITEMS.values()).slice(0, data.limit || 3);
      const reply =
        items.length === 0
          ? 'Catalogo non disponibile.'
          : `Posso proporre: ${items.map((item) => item.name).join(', ')}.`;

      return {
        ok: true,
        cartUpdates: [],
        reply
      };
    }
  }
};

const TOOL_DEFINITIONS = Object.entries(TOOL_CONFIG).map(([name, config]) => ({
  type: 'function',
  name,
  description: 'Usa il tool per modificare il carrello in modo strutturato.',
  parameters: config.parameters
}));

function collectToolCalls(outputs) {
  if (!Array.isArray(outputs)) return [];
  const toolCalls = [];

  outputs.forEach((output) => {
    if (output?.type === 'tool_call') {
      toolCalls.push(output);
      return;
    }

    if (output?.type === 'message' && Array.isArray(output.content)) {
      output.content.forEach((part) => {
        if (part?.type === 'tool_call') {
          toolCalls.push(part);
        }
      });
    }
  });

  return toolCalls;
}

function withTimeout(promise, timeoutMs, errorMessage) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMessage || 'Operation timed out')), timeoutMs);
  });

  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

async function runLLM(prompt) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const aiCall = client.responses.create({
    model: 'gpt-4o-mini-2024-07-18',
    input: [
      {
        role: 'system',
        content:
          'Sei un orchestratore ordini. Rispondi SOLO usando tool_call obbligatorio. Non restituire mai testo libero. Non generare prezzi.'
      },
      { role: 'user', content: prompt }
    ],
    tools: TOOL_DEFINITIONS,
    tool_choice: 'auto'
  });

  return withTimeout(aiCall, LLM_TIMEOUT_MS, 'llm_timeout');
}

function isHealthRequest(event) {
  const path = String(event.path || event.rawUrl || '').toLowerCase();
  return path.includes('orchestrator-v3/health');
}

exports.handler = async (event) => {
  const startedAt = Date.now();

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: JSON_HEADERS,
      body: ''
    };
  }

  if (isHealthRequest(event) && event.httpMethod === 'GET') {
    return jsonResponse(200, {
      status: 'ok',
      catalogLoaded: CATALOG_ITEMS.size > 0,
      schemaLoaded: true
    });
  }

  if (event.httpMethod !== 'POST') {
    const validated = validateResponse({
      ok: false,
      cartUpdates: [],
      reply: 'Metodo non consentito.'
    });

    return jsonResponse(405, validated);
  }

  try {
    const parsedBody = parseBody(event.body);
    if (!parsedBody || typeof parsedBody !== 'object') {
      const invalidBodyResponse = validateResponse({
        ok: false,
        cartUpdates: [],
        reply: 'Body richiesta non valido.'
      });

      logExecution({
        intent: 'invalid_body',
        toolUsed: null,
        validation: 'invalid',
        finalCartDelta: [],
        executionTimeMs: Date.now() - startedAt,
        status: 'error',
        error: 'invalid_body'
      });

      return jsonResponse(200, invalidBodyResponse);
    }

    const message = String(parsedBody.message || parsedBody.prompt || '').trim();
    if (!message) {
      const missingMessageResponse = validateResponse({
        ok: false,
        cartUpdates: [],
        reply: 'Messaggio mancante.'
      });

      logExecution({
        intent: 'missing_message',
        toolUsed: null,
        validation: 'invalid',
        finalCartDelta: [],
        executionTimeMs: Date.now() - startedAt,
        status: 'error',
        error: 'missing_message'
      });

      return jsonResponse(200, missingMessageResponse);
    }

    const routed = routeDomain(message);
    const recommendationIntent =
      routed.intent !== 'add' && routed.intent !== 'build'
        ? detectRecommendationIntent(message, routed.domain)
        : false;

    if (routed.domain === 'PANINO') {
      const paninoResponse = handlePanino({ message, intent: routed.intent });
      const validatedPanino = validateResponse(paninoResponse);

      logExecution({
        intent: 'panino',
        toolUsed: validatedPanino.cartUpdates.length ? 'add_item' : null,
        validation: validatedPanino.ok ? 'valid' : 'invalid',
        finalCartDelta: validatedPanino.cartUpdates,
        executionTimeMs: Date.now() - startedAt,
        status: validatedPanino.ok ? 'success' : 'error',
        error: validatedPanino.ok ? null : validatedPanino.reply
      });

      return jsonResponse(200, validatedPanino);
    }

    if (recommendationIntent) {
      const recommendation = buildRecommendationResponse(message);
      if (recommendation) {
        const validatedRecommendation = validateResponse(recommendation);

        logExecution({
          intent: 'recommendation',
          toolUsed: null,
          validation: validatedRecommendation.ok ? 'valid' : 'invalid',
          finalCartDelta: validatedRecommendation.cartUpdates,
          executionTimeMs: Date.now() - startedAt,
          status: validatedRecommendation.ok ? 'success' : 'error',
          error: validatedRecommendation.ok ? null : validatedRecommendation.reply
        });

        return jsonResponse(200, validatedRecommendation);
      }
    }

    const directNameResponse = runExactNameMatch(message, routed.domain);
    if (directNameResponse) {
      const validatedNameMatch = validateResponse(directNameResponse);
      const nameCartType = validatedNameMatch.cartUpdates[0]?.type;
      const nameToolUsed =
        nameCartType === 'REMOVE_ITEM' ? 'remove_item' : nameCartType || 'add_item';

      logExecution({
        intent: 'direct_name_match',
        toolUsed: nameToolUsed,
        validation: validatedNameMatch.ok ? 'valid' : 'invalid',
        finalCartDelta: validatedNameMatch.cartUpdates,
        executionTimeMs: Date.now() - startedAt,
        status: validatedNameMatch.ok ? 'success' : 'error',
        error: validatedNameMatch.ok ? null : 'invalid_direct_name'
      });

      return jsonResponse(200, validatedNameMatch);
    }

    const directResponse = runDirectMatch(message);
    if (directResponse) {
      const validatedDirect = validateResponse(directResponse);
      const directCartType = validatedDirect.cartUpdates[0]?.type;
      const directToolUsed =
        directCartType === 'REMOVE_ITEM' ? 'remove_item' : directCartType || null;

      logExecution({
        intent: 'direct_match',
        toolUsed: directToolUsed,
        validation: validatedDirect.ok ? 'valid' : 'invalid',
        finalCartDelta: validatedDirect.cartUpdates,
        executionTimeMs: Date.now() - startedAt,
        status: validatedDirect.ok ? 'success' : 'error',
        error: validatedDirect.ok ? null : 'invalid_direct_match'
      });

      return jsonResponse(200, validatedDirect);
    }

    const deterministicResponse = runDeterministicIngredientMatch(message);
    if (deterministicResponse) {
      const validatedDeterministic = validateResponse(deterministicResponse);

      logExecution({
        intent: 'deterministic_ingredients',
        toolUsed:
          validatedDeterministic.cartUpdates.length > 0
            ? validatedDeterministic.cartUpdates[0]?.type === 'REMOVE_ITEM'
              ? 'remove_item'
              : 'add_item'
            : null,
        validation: validatedDeterministic.ok ? 'valid' : 'invalid',
        finalCartDelta: validatedDeterministic.cartUpdates,
        executionTimeMs: Date.now() - startedAt,
        status: validatedDeterministic.ok ? 'success' : 'error',
        error: validatedDeterministic.ok ? null : 'invalid_ingredient_match'
      });

      return jsonResponse(200, validatedDeterministic);
    }

    let fallbackLogData = null;

    if (!process.env.OPENAI_API_KEY) {
      fallbackLogData = {
        intent: 'info',
        toolUsed: null,
        validation: 'skipped',
        finalCartDelta: [],
        status: 'success',
        error: null
      };
    } else {
      let aiResponse = null;
      try {
        aiResponse = await runLLM(message);
      } catch (err) {
        fallbackLogData = {
          intent: 'llm_timeout',
          toolUsed: null,
          validation: 'skipped',
          finalCartDelta: [],
          status: 'error',
          error: err && err.message ? err.message : 'llm_error'
        };
      }

      if (aiResponse) {
        const toolCalls = collectToolCalls(aiResponse?.output);
        const primaryToolCall = toolCalls[0];

        if (!primaryToolCall) {
          fallbackLogData = {
            intent: 'none',
            toolUsed: null,
            validation: 'skipped',
            finalCartDelta: [],
            status: 'success',
            error: null
          };
        } else {
          const toolConfig = TOOL_CONFIG[primaryToolCall.name];
          if (!toolConfig) {
            return jsonResponse(200, { ok: false, cartUpdates: [], error: 'INVALID_TOOL_PAYLOAD' });
          }

          const parsed = parseWith(toolConfig.schema, parseArgs(primaryToolCall.arguments));
          if (!parsed.ok) {
            logExecution({
              intent: primaryToolCall.name,
              toolUsed: primaryToolCall.name,
              validation: 'invalid',
              finalCartDelta: [],
              executionTimeMs: Date.now() - startedAt,
              status: 'error',
              error: 'INVALID_TOOL_PAYLOAD'
            });
            return jsonResponse(200, { ok: false, cartUpdates: [], error: 'INVALID_TOOL_PAYLOAD' });
          }

          const execution = toolConfig.executor(parsed.data);
          if (execution.ok === false && execution.error) {
            logExecution({
              intent: primaryToolCall.name,
              toolUsed: primaryToolCall.name,
              validation: 'invalid',
              finalCartDelta: [],
              executionTimeMs: Date.now() - startedAt,
              status: 'error',
              error: execution.error
            });
            return jsonResponse(200, { ok: false, cartUpdates: [], error: 'INVALID_TOOL_PAYLOAD' });
          }

          const validatedResponse = validateResponse(execution);

          logExecution({
            intent: primaryToolCall.name,
            toolUsed: primaryToolCall.name,
            validation: validatedResponse.ok ? 'valid' : 'invalid',
            finalCartDelta: validatedResponse.cartUpdates,
            executionTimeMs: Date.now() - startedAt,
            status: validatedResponse.ok ? 'success' : 'error',
            error: validatedResponse.ok ? null : validatedResponse.reply
          });

          return jsonResponse(200, validatedResponse);
        }
      }
    }

    const fallback = validateResponse({
      ok: true,
      cartUpdates: [],
      reply: 'Puoi indicarmi il nome esatto della pizza?'
    });

    if (fallbackLogData) {
      logExecution({
        ...fallbackLogData,
        executionTimeMs: Date.now() - startedAt
      });
    }

    return jsonResponse(200, fallback);
  } catch (error) {
    const fallback = validateResponse(FALLBACK_RESPONSE);

    logExecution({
      intent: 'unknown',
      toolUsed: null,
      validation: 'error',
      finalCartDelta: [],
      executionTimeMs: Date.now() - startedAt,
      status: 'error',
      error: error && error.message ? error.message : 'unknown_error'
    });

    return jsonResponse(200, fallback);
  }
};
