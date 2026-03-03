const INTENT_VERBS = Object.freeze({
  add: ['aggiungi', 'metti', 'inserisci'],
  build: ['crea', 'costruisci'],
  suggest: ['consiglia', 'suggerisci']
});

const DOMAIN_KEYWORDS = Object.freeze({
  PANINO: ['panino', 'panini', 'sandwich'],
  MENU: ['pizza', 'pizze', 'menu', 'menù']
});

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function detectIntent(normalizedText) {
  if (!normalizedText) {
    return 'info';
  }

  if (INTENT_VERBS.add.some((verb) => normalizedText.includes(verb))) {
    return 'add';
  }

  if (INTENT_VERBS.build.some((verb) => normalizedText.includes(verb))) {
    return 'build';
  }

  if (INTENT_VERBS.suggest.some((verb) => normalizedText.includes(verb))) {
    return 'suggest';
  }

  return 'info';
}

function detectDomain(normalizedText) {
  if (DOMAIN_KEYWORDS.PANINO.some((keyword) => normalizedText.includes(keyword))) {
    return 'PANINO';
  }

  if (DOMAIN_KEYWORDS.MENU.some((keyword) => normalizedText.includes(keyword))) {
    return 'MENU';
  }

  return 'MENU';
}

function routeDomain(input) {
  const normalizedText = normalizeText(input);
  return {
    domain: detectDomain(normalizedText),
    intent: detectIntent(normalizedText),
    normalizedText
  };
}

module.exports = {
  routeDomain
};
