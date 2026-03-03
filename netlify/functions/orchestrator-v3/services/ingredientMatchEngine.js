const { normalizeIngredientId } = require('../schemas/orderSchemas');

function normalizeIngredients(list) {
  return Array.from(
    new Set((Array.isArray(list) ? list : []).map(normalizeIngredientId).filter(Boolean))
  );
}

function findBestMatches(requestedIngredients, catalog = []) {
  const requested = normalizeIngredients(requestedIngredients);
  if (requested.length === 0) {
    return { similar: [] };
  }

  const requestedSet = new Set(requested);
  let identical = undefined;
  const similar = [];

  catalog.forEach((pizza) => {
    const pizzaIngredients = normalizeIngredients([
      ...(Array.isArray(pizza?.ingredients) ? pizza.ingredients : []),
      ...(Array.isArray(pizza?.ingredienti) ? pizza.ingredienti : [])
    ]);

    if (pizzaIngredients.length === 0) {
      return;
    }

    const pizzaSet = new Set(pizzaIngredients);
    const commonIngredients = requested.filter((ingredient) => pizzaSet.has(ingredient));
    const commonCount = commonIngredients.length;
    const matchRatio = requested.length === 0 ? 0 : commonCount / requested.length;
    const ingredientDifference = Math.abs(pizzaIngredients.length - requested.length);
    const price = Number(pizza?.price_cents ?? pizza?.price ?? pizza?.base_price_cents ?? 0) || 0;

    if (requested.length === pizzaIngredients.length && commonCount === requested.length) {
      if (
        !identical ||
        price < (Number(identical.price_cents ?? identical.price ?? 0) || 0) ||
        ingredientDifference < Math.abs(normalizeIngredients(identical.ingredients || []).length - requested.length)
      ) {
        identical = pizza;
      }
      return;
    }

    if (matchRatio >= 0.7) {
      similar.push({
        pizza,
        matchRatio,
        ingredientDifference,
        price
      });
    }
  });

  const sortedSimilar = similar
    .filter((entry) => !identical || entry.pizza !== identical)
    .sort((a, b) => {
      if (b.matchRatio !== a.matchRatio) {
        return b.matchRatio - a.matchRatio;
      }
      if (a.ingredientDifference !== b.ingredientDifference) {
        return a.ingredientDifference - b.ingredientDifference;
      }
      return a.price - b.price;
    })
    .slice(0, 2)
    .map((entry) => entry.pizza);

  return {
    identical,
    similar: sortedSimilar
  };
}

module.exports = {
  findBestMatches
};
