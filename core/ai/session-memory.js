// In-memory rotation cache; resets on cold starts and is intended only for short-lived anti-repetition.
const memory = new Map();
const MAX_RECENT_SUGGESTIONS = 3;

function getKey(sessionId) {
  return sessionId || "global";
}

function getRecentSuggestions(sessionId) {
  return memory.get(getKey(sessionId)) || [];
}

function rememberSuggestion(sessionId, id) {
  if (!id) return;
  const key = getKey(sessionId);
  const current = getRecentSuggestions(sessionId).filter((value) => value !== id);
  current.unshift(id);
  memory.set(key, current.slice(0, MAX_RECENT_SUGGESTIONS));
}

function clearSuggestions(sessionId) {
  memory.set(getKey(sessionId), []);
}

module.exports = {
  getRecentSuggestions,
  rememberSuggestion,
  clearSuggestions
};
