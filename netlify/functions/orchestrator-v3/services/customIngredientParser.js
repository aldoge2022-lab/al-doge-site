function normalizeNaturalText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[.,;:!?()[\]{}"/\\|+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(items) {
  return Array.from(new Set((items || []).filter(Boolean)));
}

function buildCanonicalLookup(knownIngredients = []) {
  const canonicalByNormalized = new Map();

  for (const raw of knownIngredients) {
    const canonical = String(raw || '').trim();
    if (!canonical) continue;
    canonicalByNormalized.set(normalizeNaturalText(canonical), canonical);
  }

  return canonicalByNormalized;
}

function hasCanonical(normalizedKey, canonicalLookup) {
  return canonicalLookup.has(normalizedKey);
}

function resolveProsciuttoAlias(alias, canonicalLookup) {
  const normalizedAlias = normalizeNaturalText(alias);

  const hasCotto = hasCanonical('prosciutto cotto', canonicalLookup);
  const hasCrudo = hasCanonical('prosciutto crudo', canonicalLookup);
  const hasGeneric = hasCanonical('prosciutto', canonicalLookup);

  if (normalizedAlias === 'prosciutto cotto' || normalizedAlias === 'cotto') {
    if (hasCotto) return canonicalLookup.get('prosciutto cotto');
    if (hasGeneric) return canonicalLookup.get('prosciutto');
  }

  if (normalizedAlias === 'prosciutto crudo' || normalizedAlias === 'crudo') {
    if (hasCrudo) return canonicalLookup.get('prosciutto crudo');
    if (hasGeneric) return canonicalLookup.get('prosciutto');
  }

  if (normalizedAlias === 'prosciutto') {
    if (hasGeneric) return canonicalLookup.get('prosciutto');
  }

  return null;
}

function buildAliasMap(knownIngredients = []) {
  const canonicalLookup = buildCanonicalLookup(knownIngredients);
  const aliasToCanonical = new Map();

  function addAlias(alias, canonical) {
    const normalizedAlias = normalizeNaturalText(alias);
    if (!normalizedAlias || !canonical) return;
    aliasToCanonical.set(normalizedAlias, canonical);
  }

  for (const canonical of canonicalLookup.values()) {
    addAlias(canonical, canonical);
  }

  for (const canonical of canonicalLookup.values()) {
    const normalizedCanonical = normalizeNaturalText(canonical);

    if (normalizedCanonical === 'mozzarella di bufala') {
      addAlias('bufala', canonical);
      addAlias('mozzarella bufala', canonical);
      addAlias('mozzarella di bufala', canonical);
    }

    if (normalizedCanonical === 'prosciutto cotto' || normalizedCanonical === 'prosciutto crudo' || normalizedCanonical === 'prosciutto') {
      addAlias('prosciutto', resolveProsciuttoAlias('prosciutto', canonicalLookup) || canonical);
      const cottoResolved = resolveProsciuttoAlias('cotto', canonicalLookup);
      const crudoResolved = resolveProsciuttoAlias('crudo', canonicalLookup);

      if (cottoResolved) {
        addAlias('cotto', cottoResolved);
        addAlias('prosciutto cotto', cottoResolved);
      }

      if (crudoResolved) {
        addAlias('crudo', crudoResolved);
        addAlias('prosciutto crudo', crudoResolved);
      }
    }

    if (normalizedCanonical === 'wurstel' || normalizedCanonical === 'würstel') {
      addAlias('wurstel', canonical);
      addAlias('würstel', canonical);
      addAlias('wurstel', canonical);
    }

    if (normalizedCanonical === 'patatine fritte' || normalizedCanonical === 'patate fritte') {
      addAlias('patatine', canonical);
      addAlias('patatine fritte', canonical);
      addAlias('patate fritte', canonical);
    }

    if (normalizedCanonical === 'salsiccia') {
      addAlias('salsiccia', canonical);
      addAlias('salamella', canonical);
    }

    if (normalizedCanonical === 'mozzarella') {
      addAlias('mozzarella', canonical);
    }

    if (normalizedCanonical === 'rucola') addAlias('rucola', canonical);
    if (normalizedCanonical === 'grana') addAlias('grana', canonical);
    if (normalizedCanonical === 'friarielli') addAlias('friarielli', canonical);
    if (normalizedCanonical === 'pomodoro') addAlias('pomodoro', canonical);
  }

  return aliasToCanonical;
}

function containsWholePhrase(text, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'i');
  return regex.test(text);
}

function parseCustomIngredients({
  message,
  knownIngredients = [],
  allowedIngredients = knownIngredients
}) {
  const normalizedMessage = normalizeNaturalText(message);
  const aliasMap = buildAliasMap(knownIngredients);

  const allowedSet = new Set(unique(allowedIngredients));
  const matchedAliases = [];
  const recognizedIngredients = [];
  const disallowedIngredients = [];

  const sortedAliases = Array.from(aliasMap.keys()).sort((a, b) => b.length - a.length);

  for (const alias of sortedAliases) {
    if (!containsWholePhrase(normalizedMessage, alias)) continue;

    const canonical = aliasMap.get(alias);
    matchedAliases.push({ alias, canonical });

    if (allowedSet.has(canonical)) {
      recognizedIngredients.push(canonical);
    } else {
      disallowedIngredients.push(canonical);
    }
  }

  const hasIngredientCue =
    /\b(con|senza|aggiungi|metti|metterci|voglio|vorrei|fammi|pizza|panino|personalizzat)\b/i.test(normalizedMessage);

  return {
    rawMessage: String(message || ''),
    normalizedMessage,
    matchedAliases,
    recognizedIngredients: unique(recognizedIngredients),
    disallowedIngredients: unique(disallowedIngredients),
    hasIngredientCue
  };
}

function extractIngredientsByCategory({
  message,
  knownIngredients = [],
  allowedIngredients = knownIngredients
}) {
  return parseCustomIngredients({
    message,
    knownIngredients,
    allowedIngredients
  });
}

module.exports = {
  normalizeNaturalText,
  parseCustomIngredients,
  extractIngredientsByCategory
};
