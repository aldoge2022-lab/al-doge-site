(function (globalScope) {
  const FORMAT_SURCHARGES = Object.freeze({
    normale: 0,
    maxi: 5
  });

  const DOUGH_SURCHARGES = Object.freeze({
    normale: 0,
    'farina-di-riso': 1.5,
    kamut: 1.5
  });

  const EXTRA_SURCHARGES = Object.freeze({
    verdure: 1.5,
    affettati: 2,
    'burrata-bufala': 3
  });

  const FORMAT_LABELS = Object.freeze({
    normale: 'Normale',
    maxi: 'Maxi'
  });

  const DOUGH_LABELS = Object.freeze({
    normale: 'Normale',
    'farina-di-riso': 'Farina di riso',
    kamut: 'Kamut'
  });

  const EXTRA_LABELS = Object.freeze({
    verdure: 'Verdure',
    affettati: 'Affettati',
    'burrata-bufala': 'Burrata / bufala'
  });

  const DEFAULT_VARIANT_SIGNATURE = 'Normale::Normale::Nessuno';

  function toMoneyCents(value) {
    return Math.round((Number(value) || 0) * 100);
  }

  function toEuros(cents) {
    return Math.round(cents) / 100;
  }

  function normalizeKey(value, fallback) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized || fallback;
  }

  function normalizeExtraKeys(extras) {
    if (!Array.isArray(extras)) return [];
    return Array.from(
      new Set(
        extras
          .map((extra) => normalizeKey(extra, ''))
          .filter((extra) => Object.prototype.hasOwnProperty.call(EXTRA_SURCHARGES, extra))
      )
    );
  }

  function calculateFinalPizzaPrice(basePrice, options = {}) {
    const formatKey = normalizeKey(options.format, 'normale');
    const doughKey = normalizeKey(options.dough, 'normale');
    const extraKeys = normalizeExtraKeys(options.extras);

    const baseCents = toMoneyCents(basePrice);
    const formatCents = toMoneyCents(FORMAT_SURCHARGES[formatKey] || 0);
    const doughCents = toMoneyCents(DOUGH_SURCHARGES[doughKey] || 0);
    const extrasCents = extraKeys.reduce((sum, key) => sum + toMoneyCents(EXTRA_SURCHARGES[key] || 0), 0);

    return toEuros(baseCents + formatCents + doughCents + extrasCents);
  }

  function getVariantLabels(options = {}) {
    const formatKey = normalizeKey(options.format, 'normale');
    const doughKey = normalizeKey(options.dough, 'normale');
    const extraKeys = normalizeExtraKeys(options.extras);

    return {
      format: FORMAT_LABELS[formatKey] || FORMAT_LABELS.normale,
      dough: DOUGH_LABELS[doughKey] || DOUGH_LABELS.normale,
      extras: extraKeys.map((key) => EXTRA_LABELS[key]).filter(Boolean)
    };
  }

  function getVariantSignature(options = {}) {
    const labels = getVariantLabels(options);
    const extras = labels.extras.length ? labels.extras.join('|') : 'Nessuno';
    return `${labels.format}::${labels.dough}::${extras}`;
  }

  const PizzaPricing = {
    FORMAT_SURCHARGES,
    DOUGH_SURCHARGES,
    EXTRA_SURCHARGES,
    DEFAULT_VARIANT_SIGNATURE,
    calculateFinalPizzaPrice,
    getVariantLabels,
    getVariantSignature
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PizzaPricing;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.PizzaPricing = PizzaPricing;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
