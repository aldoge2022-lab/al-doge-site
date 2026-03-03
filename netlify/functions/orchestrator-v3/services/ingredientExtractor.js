const { VALID_INGREDIENTS, normalizeIngredientId } = require('../schemas/orderSchemas');

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TOKEN_SPLIT_REGEX = /\s+/;
const EXCLUSION_SEGMENT_REGEX = /\bsenza\b([^,.;!?]*)/giu;
const EXCLUSION_STOP_REGEX = /\b(ma|pero|però|tranne|esclus[oa]|con)\b/iu;

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

function extractExcludedIngredients(text) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return [];
  }

  const excluded = new Set();

  for (const match of normalizedText.matchAll(EXCLUSION_SEGMENT_REGEX)) {
    const segment = String(match[1] || '');
    const stopMatch = segment.match(EXCLUSION_STOP_REGEX);
    const scopedSegment = stopMatch ? segment.slice(0, stopMatch.index) : segment;

    extractValidIngredients(scopedSegment).forEach((ingredient) => {
      excluded.add(ingredient);
    });
  }

  return Array.from(excluded);
}

module.exports = {
  extractValidIngredients,
  extractExcludedIngredients
};
