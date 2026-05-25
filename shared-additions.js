(function (globalScope) {
  const EXTRA_CATEGORIES = Object.freeze([
    {
      key: 'verdure',
      label: 'Verdure',
      surcharge: 1.5,
      ingredients: Object.freeze([
        'Funghi freschi', 'Funghi porcini', 'Carciofi', 'Peperoni', 'Cipolla', 'Patate al forno',
        'Patatine', 'Rucola', 'Pomodorini', 'Zucchine', 'Spinaci', 'Radicchio di Treviso',
        'Melanzane', 'Asparagi', 'Fagioli', 'Olive nere', 'Olive verdi', 'Olive taggiasche',
        'Pomodori secchi', 'Capperi', 'Friarielli', 'Noci'
      ])
    },
    {
      key: 'affettati',
      label: 'Affettati',
      surcharge: 2,
      ingredients: Object.freeze([
        'Prosciutto cotto', 'Prosciutto crudo San Daniele', 'Bresaola', 'Speck', 'Pancetta',
        'Salamino piccante', 'Wurstel', 'Salsiccia', 'Salame dolce', "Petto d'oca", 'Acciughe',
        'Tonno', 'Salmone', 'Salmone affumicato', 'Gamberetti', 'Frutti di mare'
      ])
    },
    {
      key: 'burrata-bufala',
      label: 'Burrata / bufala',
      surcharge: 3,
      ingredients: Object.freeze(['Burrata', 'Mozzarella di bufala'])
    }
  ]);

  const SURCHARGES = Object.freeze(
    EXTRA_CATEGORIES.reduce((acc, category) => {
      acc[category.key] = category.surcharge;
      return acc;
    }, {})
  );

  function getAdditionSurcharge(categoryKey) {
    return Number(SURCHARGES[String(categoryKey || '').trim()] || 0);
  }

  const SharedAdditions = {
    EXTRA_CATEGORIES,
    SURCHARGES,
    getAdditionSurcharge
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SharedAdditions;
  }

  if (globalScope && typeof globalScope === 'object') {
    globalScope.SharedAdditions = SharedAdditions;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
