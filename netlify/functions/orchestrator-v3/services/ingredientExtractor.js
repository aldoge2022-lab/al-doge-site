const { VALID_INGREDIENTS, normalizeIngredientId } = require('../schemas/orderSchemas');

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TOKEN_SPLIT_REGEX = /\s+/;

function extractValidIngredients(text) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return [];
  }

  const found = new Set();
  const textTokens = new Set(normalizedText.split(TOKEN_SPLIT_REGEX).filter(Boolean));

  VALID_INGREDIENTS.forEach((ingredient) => {
    const normalizedIngredient = normalizeIngredientId(ingredient);
    if (!normalizedIngredient) {
      return;
    }

    const ingredientTokens = normalizedIngredient.split(TOKEN_SPLIT_REGEX);

    const allTokensPresent = ingredientTokens.every((token) => textTokens.has(token));
    if (allTokensPresent) {
      found.add(normalizedIngredient);
    }
  });

  return Array.from(found);
}

module.exports = {
  extractValidIngredients
};
