const memory = new Map();

function getKey(sessionId) {
  return sessionId || "global";
}

function getRecentSuggestions(sessionId) {
  return memory.get(getKey(sessionId)) || [];
}

function rememberSuggestion(sessionId, id) {
  if (!id) return;
  const key = getKey(sessionId);
  const current = getRecentSuggestions(key).filter((value) => value !== id);
  current.unshift(id);
  memory.set(key, current.slice(0, 3));
}

function clearSuggestions(sessionId) {
  memory.set(getKey(sessionId), []);
}

module.exports = {
  getRecentSuggestions,
  rememberSuggestion,
  clearSuggestions
};
