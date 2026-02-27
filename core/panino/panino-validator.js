function normalizeIngredient(value = "") {
  return String(value).trim().toLowerCase();
}

function validatePaninoInput(input = {}) {
  const ingredients = Array.isArray(input.ingredients) ? input.ingredients : [];
  const normalizedIngredients = ingredients
    .map((ingredient) => normalizeIngredient(ingredient))
    .filter(Boolean);

  if (!normalizedIngredients.length) {
    return {
      ok: false,
      error: "At least one ingredient is required",
      ingredients: [],
    };
  }

  return {
    ok: true,
    ingredients: normalizedIngredients,
  };
}

module.exports = {
  validatePaninoInput,
};
