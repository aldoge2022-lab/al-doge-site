const FALLBACK_RESPONSE = Object.freeze({
  ok: false,
  cartUpdates: [],
  reply: 'Errore interno sistema ordine.'
});
const ALLOWED_MODES = new Set(['recommendation']);

function isValidCartUpdate(item) {
  return Boolean(
    item &&
    typeof item === 'object' &&
    typeof item.type === 'string' &&
    item.type.trim() &&
    typeof item.qty === 'number' &&
    Number.isFinite(item.qty) &&
    item.qty > 0
  );
}

function normalizeReply(reply) {
  if (typeof reply !== 'string') {
    return '';
  }

  return reply.trim();
}

function normalizeSuggestions(rawSuggestions) {
  if (!Array.isArray(rawSuggestions)) {
    return [];
  }

  return rawSuggestions
    .map((entry) => {
      if (typeof entry === 'string') {
        const stringName = normalizeReply(entry);
        return stringName ? { name: stringName } : null;
      }

      if (entry && typeof entry === 'object') {
        const id = normalizeReply(entry.id);
        const name = normalizeReply(entry.name || id);
        const reason = normalizeReply(entry.reason);

        if (!name) {
          return null;
        }

        const normalized = { name };
        if (id) {
          normalized.id = id;
        }
        if (reason) {
          normalized.reason = reason;
        }
        return normalized;
      }

      return null;
    })
    .filter(Boolean);
}

function validateResponse(rawResponse) {
  if (!rawResponse || typeof rawResponse !== 'object') {
    return { ...FALLBACK_RESPONSE };
  }

  const ok = rawResponse.ok === true;
  const normalizedReply = normalizeReply(rawResponse.reply);
  const hasNullCartUpdatesOnSuccess = ok && rawResponse.cartUpdates == null;
  const normalizedCartUpdates = Array.isArray(rawResponse.cartUpdates)
    ? rawResponse.cartUpdates
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }

          const qty = Number(item.qty);
          return {
            ...item,
            type: typeof item.type === 'string' ? item.type.trim() : item.type,
            qty
          };
        })
        .filter(Boolean)
    : [];

  const normalizedSuggestions = normalizeSuggestions(rawResponse.suggestions);
  const mode = typeof rawResponse.mode === 'string' ? rawResponse.mode.trim() : undefined;
  const normalizedType = typeof rawResponse.type === 'string' ? rawResponse.type.trim() : undefined;
  const normalizedItem =
    rawResponse.item && typeof rawResponse.item === 'object' ? { ...rawResponse.item } : undefined;

  const cartUpdatesAreValid = normalizedCartUpdates.every(isValidCartUpdate);

  if (!normalizedReply || hasNullCartUpdatesOnSuccess || !cartUpdatesAreValid) {
    return { ...FALLBACK_RESPONSE };
  }

  const validated = {
    ok,
    cartUpdates: normalizedCartUpdates,
    reply: normalizedReply,
    suggestions: normalizedSuggestions,
    type: normalizedType,
    item: normalizedItem
  };

  if (validated.suggestions && validated.suggestions.length === 0) {
    delete validated.suggestions;
  }

  if (mode && ALLOWED_MODES.has(mode)) {
    validated.mode = mode;
  }

  return validated;
}

module.exports = {
  FALLBACK_RESPONSE,
  validateResponse
};
