const OpenAI = require('openai');
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
  normalizeIngredientId
} = require('./orchestrator-v3/schemas/orderSchemas');
const { buildOrderItem, CATALOG_ITEMS } = require('./orchestrator-v3/services/orderBuilder');
const {
  extractValidIngredients,
  extractExcludedIngredients
} = require('./orchestrator-v3/services/ingredientExtractor');
const { findBestMatches } = require('./orchestrator-v3/services/ingredientMatchEngine');

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const PRIMARY_RECOMMENDATION_TOKENS = ['consigli', 'qualcosa', 'leggera', 'piccante', 'vegetariana'];
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
  const ingredients = extractValidIngredients(message);
  if (ingredients.length === 0) {
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

  if (!RECOMMENDATION_REGEX.test(normalizedMessage)) {
    return false;
  }

  return hasPrimaryToken || hasQuestionTone || hasExclusionToken;
}

function normalizeCatalogIngredients(item) {
  return [
    ...(Array.isArray(item?.ingredients) ? item.ingredients : []),
    ...(Array.isArray(item?.ingredienti) ? item.ingredienti : [])
  ]
    .map(normalizeIngredientId)
    .filter(Boolean);
}

function buildRecommendationResponse(message) {
  const normalizedMessage = String(message || '').toLowerCase();
  const wantsPiccante = normalizedMessage.includes(PICCANTE_TOKEN);
  const wantsVegetariana = normalizedMessage.includes('vegetar');
  const wantsLeggera = normalizedMessage.includes('legger');
  const desiredIngredients = extractValidIngredients(message);
  const excludedIngredients = extractExcludedIngredients(message);
  const desiredWithoutExcluded = desiredIngredients.filter(
    (ingredient) => !excludedIngredients.includes(ingredient)
  );
  const catalogItems = Array.from(CATALOG_ITEMS.values());

  if (catalogItems.length === 0) {
    return null;
  }

  const scored = catalogItems.map((item) => {
    const ingredients = normalizeCatalogIngredients(item);
    const tags = Array.isArray(item?.tags) ? item.tags.map((tag) => String(tag).toLowerCase()) : [];
    const ingredientMatches = desiredWithoutExcluded.filter((ingredient) => ingredients.includes(ingredient));
    const excludedMatches = excludedIngredients.filter((ingredient) => ingredients.includes(ingredient));

    if (excludedMatches.length > 0) {
      return {
        item,
        score: Number.NEGATIVE_INFINITY,
        reason: `Esclusa: contiene ${excludedMatches.join(', ')}`,
        price: Number(item?.price_cents ?? item?.price ?? item?.base_price_cents ?? 0) || 0
      };
    }

    let score = ingredientMatches.length * 2;
    const reasonParts = [];

    if (ingredientMatches.length > 0) {
      reasonParts.push(`Contiene ${ingredientMatches.join(', ')}`);
    }

    const hasPiccante =
      tags.some((tag) => tag.includes(PICCANTE_TOKEN)) ||
      ingredients.some((id) => id.includes(PICCANTE_TOKEN));
    if (wantsPiccante && hasPiccante) {
      score += 3;
      reasonParts.push('Nota piccante');
    }

    const hasVegetariana = tags.some((tag) => tag.includes('vegetar'));
    if (wantsVegetariana && hasVegetariana) {
      score += 3;
      reasonParts.push('Opzione vegetariana');
    }

    if (wantsLeggera && ingredients.length <= 3) {
      score += 2;
      reasonParts.push('Leggera con pochi ingredienti');
    }

    if (
      score === 0 &&
      (desiredWithoutExcluded.length === 0 || wantsPiccante || wantsVegetariana || wantsLeggera)
    ) {
      score = DEFAULT_RECOMMENDATION_SCORE;
    }

    const price = Number(item?.price_cents ?? item?.price ?? item?.base_price_cents ?? 0) || 0;

    return {
      item,
      score,
      reason: reasonParts.join('. ') || 'Scelta dal menu',
      price
    };
  });

  const scoredWithoutExcluded = scored.filter((entry) => Number.isFinite(entry.score));
  const scoredWithPositive = scoredWithoutExcluded.filter((entry) => entry.score > 0);
  const candidates = scoredWithPositive.length > 0 ? scoredWithPositive : scoredWithoutExcluded;

  const top = candidates
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.price - b.price;
    })
    .slice(0, 3);

  if (top.length === 0) {
    return null;
  }

  const suggestions = top.map(({ item, reason }) => ({
    id: String(item.id),
    name: String(item.name || item.id),
    reason: reason || 'Scelta dal menu'
  }));

  const names = suggestions.map((suggestion) => suggestion.name);
  const replyPrompt =
    suggestions.length > 1 ? 'Vuoi aggiungerle al carrello?' : 'Vuoi aggiungerla al carrello?';
  const reply = `Ti consiglio ${names.join(' oppure ')}. ${replyPrompt}`;

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
