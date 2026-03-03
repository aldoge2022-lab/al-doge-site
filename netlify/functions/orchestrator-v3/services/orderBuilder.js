const catalog = require('../../../../data/catalog');
const { calculateSupplements, calculateAllergens } = require('../../../../core/menu/food-engine');
const { normalizeIngredientId, VALID_INGREDIENTS } = require('../schemas/orderSchemas');

const CATALOG_ITEMS = new Map(
  (Array.isArray(catalog.menu) ? catalog.menu : [])
    .filter((item) => item && item.active !== false && item.id)
    .map((item) => [String(item.id), item])
);

function assertIngredientList(list, label) {
  if (!Array.isArray(list)) {
    throw new Error(`invalid_${label}`);
  }

  list.forEach((item) => {
    const normalized = normalizeIngredientId(item);
    if (!VALID_INGREDIENTS.has(normalized)) {
      throw new Error(`invalid_${label}`);
    }
  });
}

function buildOrderItem({ baseItem, extraIngredients = [], removedIngredients = [], quantity = 1 }) {
  if (!baseItem || !baseItem.id || !CATALOG_ITEMS.has(String(baseItem.id))) {
    throw new Error('invalid_base_item');
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new Error('invalid_quantity');
  }

  assertIngredientList(extraIngredients, 'extra_ingredients');
  assertIngredientList(removedIngredients, 'removed_ingredients');

  const normalizedBaseIngredients = [
    ...(Array.isArray(baseItem.ingredients) ? baseItem.ingredients : []),
    ...(Array.isArray(baseItem.ingredienti) ? baseItem.ingredienti : [])
  ]
    .map(normalizeIngredientId)
    .filter((id) => VALID_INGREDIENTS.has(id));

  const removedSet = new Set(removedIngredients.map(normalizeIngredientId));
  const extraSet = new Set(extraIngredients.map(normalizeIngredientId));

  const finalIngredients = Array.from(
    new Set([
      ...normalizedBaseIngredients.filter((id) => !removedSet.has(id)),
      ...Array.from(extraSet)
    ])
  );

  const extraCost = calculateSupplements(Array.from(extraSet));
  const basePrice = Number(baseItem.price_cents ?? baseItem.base_price_cents ?? baseItem.price ?? 0) || 0;
  const unitPrice = Math.round((basePrice + extraCost) * 100) / 100;
  const allergens = calculateAllergens(finalIngredients);

  return {
    type: 'MENU_ITEM',
    id: String(baseItem.id),
    name: String(baseItem.name || baseItem.id),
    qty: quantity,
    ingredients: finalIngredients,
    allergens,
    price: unitPrice
  };
}

module.exports = {
  buildOrderItem,
  CATALOG_ITEMS
};
