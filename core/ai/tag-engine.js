const { normalizeText } = require("./intent-router");

const TAG_PROMPT_MAP = [
  { keyword: "leggera", tag: "leggera" },
  { keyword: "leggero", tag: "leggera" },
  { keyword: "gourmet", tag: "gourmet" },
  { keyword: "particolar", tag: "gourmet" },
  { keyword: "special", tag: "gourmet" },
  { keyword: "ricca", tag: "ricca" },
  { keyword: "abbondante", tag: "ricca" },
  { keyword: "fresca", tag: "fresca" },
  { keyword: "vegetar", tag: "vegetariana" },
  { keyword: "vegana", tag: "vegana" },
  { keyword: "piccante", tag: "piccante" }
];

const MEAT_KEYWORDS = [
  "prosciutto",
  "speck",
  "salame",
  "salsiccia",
  "bresaola",
  "tonno",
  "acciughe",
  "wurstel",
  "crudo",
  "cotto"
];

function extractPromptTags(prompt = "") {
  const text = normalizeText(prompt);
  const tags = [];

  TAG_PROMPT_MAP.forEach(({ keyword, tag }) => {
    if (text.includes(keyword)) {
      tags.push(tag);
    }
  });

  return Array.from(new Set(tags));
}

function deriveItemTags(item = {}) {
  const tags = [];
  const categoriaNorm = normalizeText(item.categoria || "");
  const weightProfile = normalizeText(item.weight_profile || item.weightProfile || "");

  if (Array.isArray(item.tags)) {
    tags.push(...item.tags);
  }

  if (weightProfile) {
    tags.push(weightProfile);
  } else if (categoriaNorm.includes("leggera")) {
    tags.push("leggera");
  }

  if (item.categoria) {
    tags.push(item.categoria);
  }

  if (categoriaNorm.includes("special") || categoriaNorm.includes("sapor") || categoriaNorm.includes("gourmet")) {
    tags.push("gourmet");
  }

  if (categoriaNorm.includes("piccante")) {
    tags.push("piccante");
  }

  const normalizedIngredients = Array.isArray(item.ingredienti)
    ? item.ingredienti.map((ing) => normalizeText(ing))
    : [];
  const hasMeat = normalizedIngredients.some((ing) => MEAT_KEYWORDS.some((kw) => ing.includes(kw)));

  if (!hasMeat && normalizedIngredients.length) {
    tags.push("vegetariana");
  }

  return Array.from(new Set(tags.map(normalizeText))).filter(Boolean);
}

function scoreMenuByTags(prompt, menu = []) {
  const promptTags = extractPromptTags(prompt);

  if (!promptTags.length) {
    return (menu || []).map((item) => ({ ...item, score: item.score ?? 0 }));
  }

  return (menu || []).map((item) => {
    const itemTags = deriveItemTags(item);
    let score = 0;

    promptTags.forEach((tag) => {
      if (itemTags.includes(tag)) {
        score += 2;
      }
    });

    if (promptTags.includes("leggera") && itemTags.includes("leggera")) {
      score += 1;
    }

    if (promptTags.includes("gourmet") && itemTags.includes("gourmet")) {
      score += 1;
    }

    return { ...item, score };
  });
}

module.exports = {
  scoreMenuByTags,
  deriveItemTags,
  extractPromptTags
};
