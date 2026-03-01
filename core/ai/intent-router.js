// Lowercases and strips diacritics to make keyword comparisons reliable.
const normalizeText = (value = "") =>
  String(value).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();

const DESCRIPTIVE_KEYWORDS = [
  "leggera",
  "leggero",
  "gourmet",
  "particolare",
  "speciale",
  "vegetariana",
  "vegetariano",
  "vegana",
  "vegano",
  "fresca",
  "ricca",
  "abbondante",
  "saporita",
  "piccante",
  "delicata"
];

function hasIngredientSignal(text, ingredientKeywords = []) {
  if (!text) return false;
  const hasKnownIngredient = ingredientKeywords.some((kw) => kw && text.includes(normalizeText(kw)));
  const hasCompositionCue = /(con|senza)\s+[a-z]/.test(text);
  return hasKnownIngredient || hasCompositionCue;
}

function hasDescriptiveSignal(text) {
  return DESCRIPTIVE_KEYWORDS.some((kw) => text.includes(kw));
}

function routeIntent(prompt, ingredientKeywords = []) {
  const text = normalizeText(prompt);
  if (!text) {
    return "generic_advice";
  }

  if (hasIngredientSignal(text, ingredientKeywords)) {
    return "ingredient";
  }

  if (hasDescriptiveSignal(text)) {
    return "descriptive";
  }

  return "generic_advice";
}

module.exports = {
  routeIntent,
  normalizeText
};
