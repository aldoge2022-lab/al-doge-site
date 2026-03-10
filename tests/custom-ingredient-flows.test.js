const test = require('node:test');
const assert = require('node:assert/strict');

const { handlePanino } = require('../netlify/functions/orchestrator-v3/panino-handler');
const { parseCustomIngredients } = require('../netlify/functions/orchestrator-v3/services/customIngredientParser');
const { handler } = require('../netlify/functions/ai-orchestrator');

function toSet(values) {
  return new Set(Array.isArray(values) ? values : []);
}

test('panino custom recognises rucola, bufala, and prosciutto cotto alias resolves to food-core id', () => {
  const result = handlePanino({
    message: 'voglio un panino con rucola bufala e prosciutto cotto',
    intent: 'build'
  });

  assert.equal(result.ok, true);
  assert.equal(result.type, 'panino');
  assert.equal(result.cartUpdates.length, 1);

  const ingredients = result.cartUpdates[0].ingredients;
  // 'prosciutto cotto' alias resolves to food-core id 'prosciutto'
  assert.deepEqual(toSet(ingredients), new Set(['rucola', 'mozzarella di bufala', 'prosciutto']));
});

test('panino with generic prosciutto is recognised even when catalog only has variants', () => {
  const result = handlePanino({
    message: 'voglio un panino con prosciutto',
    intent: 'build'
  });

  assert.equal(result.ok, true);
  assert.equal(result.type, 'panino');
  assert.equal(result.cartUpdates.length, 1);

  const ingredients = result.cartUpdates[0].ingredients;
  assert.ok(ingredients.includes('prosciutto'), 'food-core id prosciutto must be present');
});

test('panino supplement price uses food-core ingredient id so prosciutto is not silently undercharged', () => {
  const result = handlePanino({
    message: 'panino con prosciutto cotto',
    intent: 'build'
  });

  assert.equal(result.ok, true);
  assert.equal(result.cartUpdates.length, 1);

  const item = result.cartUpdates[0];
  // prosciutto supplement is 0.5 per food-core.json, base is 5
  assert.deepEqual(item.ingredients, ['prosciutto']);
  assert.equal(item.price, 5.5);
});

test('no silent undercharge: prosciutto cotto alias and generic prosciutto yield same food-core price', () => {
  const resultCotto = handlePanino({ message: 'panino con prosciutto cotto', intent: 'build' });
  const resultGeneric = handlePanino({ message: 'panino con prosciutto', intent: 'build' });

  assert.equal(resultCotto.ok, true);
  assert.equal(resultGeneric.ok, true);

  assert.deepEqual(toSet(resultCotto.cartUpdates[0].ingredients), new Set(['prosciutto']));
  assert.deepEqual(toSet(resultGeneric.cartUpdates[0].ingredients), new Set(['prosciutto']));

  assert.ok(resultCotto.cartUpdates[0].price > 5, 'price must include supplement');
  assert.equal(resultCotto.cartUpdates[0].price, resultGeneric.cartUpdates[0].price);
});

test('panino custom with unknown ingredients returns no cart updates', () => {
  const result = handlePanino({
    message: 'voglio un panino con blabla xyz',
    intent: 'build'
  });

  assert.equal(result.ok, true);
  assert.equal(result.type, 'panino');
  assert.deepEqual(result.cartUpdates, []);
});

test('pizza custom with unknown ingredients returns no cart updates', async () => {
  const response = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({ message: 'voglio una pizza con blabla xyz' })
  });

  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.type, 'pizza');
  assert.deepEqual(body.cartUpdates, []);
});

test('generic pizza request does not create an empty product', async () => {
  const response = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({ message: 'pizza' })
  });

  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.type, 'pizza');
  assert.deepEqual(body.cartUpdates, []);
});

test('parser deduplicates aliases and keeps prosciutto cotto/crudo distinction when available', () => {
  const deduped = parseCustomIngredients({
    message: 'bufala mozzarella bufala mozzarella di bufala',
    knownIngredients: ['mozzarella di bufala'],
    allowedIngredients: ['mozzarella di bufala']
  });

  assert.deepEqual(deduped.recognizedIngredients, ['mozzarella di bufala']);

  const prosciuttoSplit = parseCustomIngredients({
    message: 'pizza con cotto e crudo',
    knownIngredients: ['prosciutto cotto', 'prosciutto crudo'],
    allowedIngredients: ['prosciutto cotto', 'prosciutto crudo']
  });

  assert.deepEqual(toSet(prosciuttoSplit.recognizedIngredients), new Set(['prosciutto cotto', 'prosciutto crudo']));

  // Generic 'prosciutto' must not be arbitrarily mapped to either variant when both exist
  const prosciuttoAmbiguous = parseCustomIngredients({
    message: 'pizza con prosciutto',
    knownIngredients: ['prosciutto cotto', 'prosciutto crudo'],
    allowedIngredients: ['prosciutto cotto', 'prosciutto crudo']
  });

  assert.deepEqual(prosciuttoAmbiguous.recognizedIngredients, []);
});
