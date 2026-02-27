const BASE_PRICE = 6;
const EXTRA_INGREDIENT_PRICE = 1;

function calculatePaninoPrice(ingredients = []) {
  const count = Array.isArray(ingredients) ? ingredients.length : 0;
  const extras = Math.max(count - 1, 0);
  return BASE_PRICE + extras * EXTRA_INGREDIENT_PRICE;
}

module.exports = {
  calculatePaninoPrice,
};
