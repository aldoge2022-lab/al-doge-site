const test = require('node:test');
const assert = require('node:assert/strict');

const PizzaPricing = require('../pizza-pricing');

test('maxi format always adds 5 euro to base pizza price', () => {
  const normalPrice = PizzaPricing.calculateFinalPizzaPrice(8.5, { format: 'normale' });
  const maxiPrice = PizzaPricing.calculateFinalPizzaPrice(8.5, { format: 'maxi' });

  assert.equal(normalPrice, 8.5);
  assert.equal(maxiPrice, 13.5);
});

test('dough and extras are summed separately after base and maxi', () => {
  const finalPrice = PizzaPricing.calculateFinalPizzaPrice(6, {
    format: 'maxi',
    dough: 'farina-di-riso',
    extras: ['verdure', 'affettati', 'burrata-bufala']
  });

  // 6.00 + 5.00 + 1.50 + 1.50 + 2.00 + 3.00
  assert.equal(finalPrice, 19);
});

test('variant labels preserve format, dough and extras for cart storage', () => {
  const labels = PizzaPricing.getVariantLabels({
    format: 'maxi',
    dough: 'kamut',
    extras: ['burrata-bufala', 'affettati']
  });

  assert.equal(labels.format, 'Maxi');
  assert.equal(labels.dough, 'Kamut');
  assert.deepEqual(labels.extras, ['Burrata / bufala', 'Affettati']);
});
