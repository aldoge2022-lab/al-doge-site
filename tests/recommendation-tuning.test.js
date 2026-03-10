const test = require('node:test');
const assert = require('node:assert/strict');

const { handler } = require('../netlify/functions/ai-orchestrator');
const catalog = require('../data/catalog');

const catalogIds = new Set(
  [
    ...(Array.isArray(catalog.menu) ? catalog.menu : []),
    ...(Array.isArray(catalog.drinks) ? catalog.drinks : []),
    ...(Array.isArray(catalog.bevande) ? catalog.bevande : []),
    ...(Array.isArray(catalog.panini) ? catalog.panini : []),
    ...(Array.isArray(catalog.panino_al_doge) ? catalog.panino_al_doge : [])
  ]
    .filter((item) => item && item.id)
    .map((item) => String(item.id))
);

async function ask(message) {
  const response = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({ message })
  });

  return JSON.parse(response.body);
}

function assertSuggestionsInCatalog(body) {
  const suggestions = Array.isArray(body.suggestions) ? body.suggestions : [];
  suggestions.forEach((suggestion) => {
    assert.equal(catalogIds.has(String(suggestion.id)), true, `Unknown suggestion id: ${suggestion.id}`);
  });
}

test('voglio qualcosa con tonno -> ingredient-aware fallback, no hallucination', async () => {
  const body = await ask('voglio qualcosa con tonno');

  assert.equal(body.ok, true);
  assert.equal(body.mode, 'recommendation');
  assert.match(body.reply, /non vedo opzioni con tonno/i);
  assert.equal(Array.isArray(body.suggestions) && body.suggestions.length > 0, true);
  assertSuggestionsInCatalog(body);
});

test('consigliami una pizza piccante -> include diavola and spicy coherence', async () => {
  const body = await ask('consigliami una pizza piccante');

  assert.equal(body.ok, true);
  assert.equal(body.mode, 'recommendation');
  assert.equal(body.suggestions[0].id, 'diavola');
  assert.match(body.suggestions[0].reason, /piccante/i);
  assertSuggestionsInCatalog(body);
});

test('vorrei un panino con pollo -> panino flow handles missing valid ingredient', async () => {
  const body = await ask('vorrei un panino con pollo');

  assert.equal(body.ok, true);
  assert.equal(body.type, 'panino');
  assert.equal(Array.isArray(body.cartUpdates) && body.cartUpdates.length, 0);
  assert.match(body.reply, /ingrediente valido/i);
});

test('non so cosa prendere -> generic recommendation, not hard fallback question', async () => {
  const body = await ask('non so cosa prendere');

  assert.equal(body.ok, true);
  assert.equal(body.mode, 'recommendation');
  assert.equal(Array.isArray(body.suggestions) && body.suggestions.length > 0, true);
  assert.doesNotMatch(body.reply, /nome esatto della pizza/i);
  assertSuggestionsInCatalog(body);
});

test('voglio qualcosa di vegetariano -> vegetarian options surfaced', async () => {
  const body = await ask('voglio qualcosa di vegetariano');

  assert.equal(body.ok, true);
  assert.equal(body.mode, 'recommendation');
  assert.equal(Array.isArray(body.suggestions) && body.suggestions.length > 0, true);
  assert.match(body.suggestions[0].reason, /vegetar/i);
  assertSuggestionsInCatalog(body);
});

test('fammi un consiglio per una pizza e una bibita -> mixed suggestion includes drink', async () => {
  const body = await ask('fammi un consiglio per una pizza e una bibita');

  assert.equal(body.ok, true);
  assert.equal(body.mode, 'recommendation');
  assert.equal(Array.isArray(body.suggestions) && body.suggestions.length > 1, true);

  const hasDrink = body.suggestions.some((suggestion) => String(suggestion.id).includes('acqua') || String(suggestion.id).includes('birra'));
  const hasPizza = body.suggestions.some((suggestion) => !String(suggestion.id).includes('acqua') && !String(suggestion.id).includes('birra'));

  assert.equal(hasDrink, true);
  assert.equal(hasPizza, true);
  assertSuggestionsInCatalog(body);
});
