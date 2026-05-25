(function (globalScope) {
  const shared = globalScope && globalScope.SharedAdditions ? globalScope.SharedAdditions : null;
  const EXTRA_CATEGORIES = shared && Array.isArray(shared.EXTRA_CATEGORIES)
    ? shared.EXTRA_CATEGORIES
    : [
      {
        key: 'verdure',
        label: 'Verdure',
        surcharge: 1.5,
        ingredients: [
          'Funghi freschi', 'Funghi porcini', 'Carciofi', 'Peperoni', 'Cipolla', 'Patate al forno',
          'Patatine', 'Rucola', 'Pomodorini', 'Zucchine', 'Spinaci', 'Radicchio di Treviso',
          'Melanzane', 'Asparagi', 'Fagioli', 'Olive nere', 'Olive verdi', 'Olive taggiasche',
          'Pomodori secchi', 'Capperi', 'Friarielli', 'Noci'
        ]
      },
      {
        key: 'affettati',
        label: 'Affettati',
        surcharge: 2,
        ingredients: [
          'Prosciutto cotto', 'Prosciutto crudo San Daniele', 'Bresaola', 'Speck', 'Pancetta',
          'Salamino piccante', 'Wurstel', 'Salsiccia', 'Salame dolce', "Petto d'oca", 'Acciughe',
          'Tonno', 'Salmone', 'Salmone affumicato', 'Gamberetti', 'Frutti di mare'
        ]
      },
      {
        key: 'burrata-bufala',
        label: 'Burrata / bufala',
        surcharge: 3,
        ingredients: ['Burrata', 'Mozzarella di bufala']
      }
    ];

  function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function round2(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  function getAdditionSurcharge(categoryKey) {
    if (shared && typeof shared.getAdditionSurcharge === 'function') {
      return shared.getAdditionSurcharge(categoryKey);
    }

    const category = EXTRA_CATEGORIES.find((entry) => entry.key === String(categoryKey || '').trim());
    return Number(category?.surcharge || 0);
  }

  function getAutomaticAdditions() {
    return [];
  }

  function calculateLineTotals(row) {
    const source = row && typeof row === 'object' ? row : {};
    const quantity = Math.max(1, Number.parseInt(source.quantity ?? source.qty ?? 1, 10) || 1);
    const basePrice = toNumber(source.basePrice ?? source.price ?? source.unitPrice, 0);
    const additions = Array.isArray(source.additions) ? source.additions : [];
    const computedAdditionsPrice = additions.reduce((sum, addition) => {
      return sum + getAdditionSurcharge(addition?.categoryKey);
    }, 0);
    const additionsPrice = Number.isFinite(Number(source.additionsPrice))
      ? Number(source.additionsPrice)
      : computedAdditionsPrice;
    const unitPrice = basePrice + additionsPrice;
    const total = round2(unitPrice * quantity);

    return {
      ...source,
      quantity,
      qty: quantity,
      basePrice: round2(basePrice),
      additions,
      additionsPrice: round2(additionsPrice),
      price: round2(unitPrice),
      subtotal: total,
      total
    };
  }

  function calculateBillTotals(items) {
    const normalized = (Array.isArray(items) ? items : []).map((item) => calculateLineTotals(item));
    const total = normalized.reduce((sum, item) => sum + Number(item.total || item.subtotal || 0), 0);
    return { items: normalized, total: round2(total) };
  }

  const TableBillUtils = {
    EXTRA_CATEGORIES,
    getAdditionSurcharge,
    getAutomaticAdditions,
    calculateLineTotals,
    calculateBillTotals
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TableBillUtils;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.TableBillUtils = TableBillUtils;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
