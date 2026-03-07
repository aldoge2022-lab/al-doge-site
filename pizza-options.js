const PIZZA_OPTION_CONFIG = {
  defaults: {
    format: 'normale',
    dough: 'standard',
    mozzarella: 'normale'
  },
  formats: [
    { key: 'normale', label: 'Normale' },
    { key: 'maxi', label: 'Maxi' }
  ],
  doughs: [
    { key: 'standard', label: 'Standard', surcharge: 0 },
    { key: 'riso', label: 'Farina di riso', surcharge: 1.5 },
    { key: 'kamut', label: 'Kamut', surcharge: 1.5 }
  ],
  mozzarellas: [
    { key: 'normale', label: 'Normale', surcharge: 0 },
    { key: 'senza-lattosio', label: 'Senza lattosio', surcharge: 0 }
  ],
  extras: [
    { key: 'verdure', label: 'Verdure', surcharge: 1.5 },
    { key: 'affettati', label: 'Affettati', surcharge: 2.0 },
    { key: 'burrata-bufala', label: 'Burrata / bufala', surcharge: 3.0 }
  ]
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getMaxiPrice(pizza = {}) {
  return toNumber(pizza.prezzo_maxi);
}

function findOption(options, key, fallbackKey) {
  return options.find((item) => item.key === key) || options.find((item) => item.key === fallbackKey) || options[0];
}

function toId(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeSelection(selection = {}, pizza = {}) {
  const normalizedExtras = Array.isArray(selection.extras) ? selection.extras : [];
  const seenExtras = new Set();
  const format = selection.format === 'maxi' && getMaxiPrice(pizza) !== null ? 'maxi' : PIZZA_OPTION_CONFIG.defaults.format;
  return {
    format,
    dough: findOption(PIZZA_OPTION_CONFIG.doughs, selection.dough, PIZZA_OPTION_CONFIG.defaults.dough).key,
    mozzarella: findOption(PIZZA_OPTION_CONFIG.mozzarellas, selection.mozzarella, PIZZA_OPTION_CONFIG.defaults.mozzarella).key,
    extras: normalizedExtras
      .map((extraKey) => findOption(PIZZA_OPTION_CONFIG.extras, extraKey))
      .filter((extra) => {
        if (!extra || seenExtras.has(extra.key)) return false;
        seenExtras.add(extra.key);
        return true;
      })
      .map((extra) => extra.key)
  };
}

function calculatePizzaPrice(pizza = {}, selection = {}) {
  const normalized = normalizeSelection(selection, pizza);
  const basePriceNormale = toNumber(pizza.prezzo) || 0;
  const basePriceMaxi = getMaxiPrice(pizza);
  const formatBasePrice = normalized.format === 'maxi' && basePriceMaxi !== null ? basePriceMaxi : basePriceNormale;

  const doughPrice = findOption(PIZZA_OPTION_CONFIG.doughs, normalized.dough, 'standard').surcharge;
  const extrasPrice = normalized.extras.reduce((sum, extraKey) => {
    return sum + findOption(PIZZA_OPTION_CONFIG.extras, extraKey).surcharge;
  }, 0);

  return Number((formatBasePrice + doughPrice + extrasPrice).toFixed(2));
}

function buildVariantLabel(selection = {}, pizza = {}) {
  const normalized = normalizeSelection(selection, pizza);
  const format = findOption(PIZZA_OPTION_CONFIG.formats, normalized.format, 'normale').label;
  const dough = findOption(PIZZA_OPTION_CONFIG.doughs, normalized.dough, 'standard').label;
  const mozzarella = findOption(PIZZA_OPTION_CONFIG.mozzarellas, normalized.mozzarella, 'normale').label;
  const extras = normalized.extras
    .map((extraKey) => findOption(PIZZA_OPTION_CONFIG.extras, extraKey))
    .filter(Boolean)
    .map((extra) => extra.label);

  const parts = [
    `Formato: ${format}`,
    `Impasto: ${dough}`,
    `Mozzarella: ${mozzarella}`
  ];

  if (extras.length) {
    parts.push(`Extra: ${extras.join(', ')}`);
  } else {
    parts.push('Extra: nessuno');
  }

  return parts.join(' • ');
}

function buildCartSignature(name, selection = {}, pizza = {}) {
  const normalized = normalizeSelection(selection, pizza);
  return [
    name || '',
    normalized.format,
    normalized.dough,
    normalized.mozzarella,
    normalized.extras.slice().sort().join('+')
  ].join('|');
}

function createPizzaCartItem(pizza = {}, quantity = 1, selection = {}) {
  const normalized = normalizeSelection(selection, pizza);
  const unitPrice = calculatePizzaPrice(pizza, normalized);
  const extras = normalized.extras.map((extraKey) => findOption(PIZZA_OPTION_CONFIG.extras, extraKey)).filter(Boolean);

  return {
    type: 'pizza',
    name: pizza.nome,
    price: unitPrice,
    quantity: Math.max(1, Number(quantity) || 1),
    ingredients: Array.isArray(pizza.ingredienti) ? pizza.ingredienti : [],
    allergeni: Array.isArray(pizza.allergeni) ? pizza.allergeni : [],
    format: findOption(PIZZA_OPTION_CONFIG.formats, normalized.format, 'normale').label,
    dough: findOption(PIZZA_OPTION_CONFIG.doughs, normalized.dough, 'standard').label,
    mozzarella: findOption(PIZZA_OPTION_CONFIG.mozzarellas, normalized.mozzarella, 'normale').label,
    extras: extras.map((extra) => extra.label),
    variantSummary: buildVariantLabel(normalized, pizza),
    signature: buildCartSignature(pizza.nome, normalized, pizza)
  };
}

const PizzaOptionEngine = {
  config: PIZZA_OPTION_CONFIG,
  toId,
  getMaxiPrice,
  normalizeSelection,
  calculatePizzaPrice,
  buildVariantLabel,
  buildCartSignature,
  createPizzaCartItem
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PizzaOptionEngine;
}

if (typeof window !== 'undefined') {
  window.PizzaOptionEngine = PizzaOptionEngine;
}
