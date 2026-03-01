const { getRecentSuggestions, rememberSuggestion, clearSuggestions } = require("./session-memory");

function sortCandidates(candidates = []) {
  return [...candidates].sort((a, b) => {
    const scoreA = Number(a.score || 0);
    const scoreB = Number(b.score || 0);
    if (scoreA !== scoreB) return scoreB - scoreA;

    const priceA = Number(a.prezzo ?? a.Prezzo ?? 0);
    const priceB = Number(b.prezzo ?? b.Prezzo ?? 0);
    if (priceA !== priceB) return priceA - priceB;

    return String(a.nome || a.Nome || "").localeCompare(String(b.nome || b.Nome || ""));
  });
}

function weightedPick(items = []) {
  if (!items.length) return null;
  const weights = items.map((item) => Math.max(1, Number(item.score || 0) + 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const roll = Math.random() * total;
  let cumulative = 0;

  for (let i = 0; i < items.length; i += 1) {
    cumulative += weights[i];
    if (roll <= cumulative) {
      return items[i];
    }
  }

  return items[0];
}

function pickRecommendation(menu = [], sessionId) {
  const pool = Array.isArray(menu) ? menu : [];
  if (!pool.length) return null;

  const recent = getRecentSuggestions(sessionId);
  let filtered = pool.filter((item) => {
    const identifier = item?.id ?? item?.nome ?? item?.Nome;
    return identifier ? !recent.includes(identifier) : true;
  });

  if (!filtered.length) {
    clearSuggestions(sessionId);
    filtered = pool;
  }

  if (!filtered.length) return null;

  const sorted = sortCandidates(filtered);
  const topCandidates = sorted.slice(0, 3);
  const candidate = weightedPick(topCandidates);

  const identifier = candidate?.id ?? candidate?.nome ?? candidate?.Nome;
  if (identifier) {
    rememberSuggestion(sessionId, identifier);
  }

  return candidate;
}

module.exports = {
  pickRecommendation
};
