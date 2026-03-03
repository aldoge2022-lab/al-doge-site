// data/catalog.js
// Catalogo normalizzato: garantisce che ogni item abbia i campi minimi richiesti dal checkout.

const PRESERVED_KEYS = ['id', 'name', 'type', 'price', 'size', 'dough', 'ingredients', 'ingredienti', 'tags', 'tag', 'active', 'price_cents', 'base_price_cents', 'extraPrice'];
const normalizeArray = (primary, fallback) => Array.isArray(primary) ? primary : (Array.isArray(fallback) ? fallback : []);

const normalizeItem = (item) => ({
  id: item.id,
  name: item.name,
  type: item.type || 'generic',
  price: Number(item.price) || 0,
  size: item.size || 'standard',
  dough: item.dough || null,
  ingredients: normalizeArray(item.ingredients),
  ingredienti: normalizeArray(item.ingredienti, item.ingredients),
  tags: normalizeArray(item.tags),
  tag: normalizeArray(item.tag, item.tags),
  active: item.active !== false,
  price_cents: Number(item.price_cents ?? item.price) || 0,
  base_price_cents: Number(item.base_price_cents ?? item.price) || 0,
  extraPrice: Number(item.extraPrice) || 0,
  ...Object.keys(item).reduce((acc, k) => {
    if (!PRESERVED_KEYS.includes(k)) {
      acc[k] = item[k];
    }
    return acc;
  }, {})
});

let catalog = {
  pizzas: [
    {
      id: 'margherita',
      name: 'Margherita',
      price: 600,
      type: 'pizza',
      ingredients: ['pomodoro', 'mozzarella'],
      tags: ['classica']
    },
    {
      id: 'diavola',
      name: 'Diavola',
      price: 700,
      type: 'pizza',
      ingredients: ['pomodoro', 'mozzarella', 'salame piccante'],
      tags: ['piccante']
    },
    {
      id: 'quattro-stagioni',
      name: '4 Stagioni',
      price: 850,
      type: 'pizza',
      ingredients: ['pomodoro', 'mozzarella', 'prosciutto', 'funghi'],
      tags: ['classica']
    },
    {
      id: 'quattro-formaggi',
      name: 'Quattro Formaggi',
      price: 800,
      type: 'pizza',
      ingredients: ['mozzarella', 'gorgonzola', 'parmigiano', 'provola'],
      tags: ['formaggi']
    },
    {
      id: 'margherita-rucola',
      name: 'Margherita Rucola',
      price: 750,
      type: 'pizza',
      ingredients: ['pomodoro', 'mozzarella', 'rucola'],
      tags: ['vegetariana']
    },
    {
      id: 'bufala',
      name: 'Bufala',
      price: 900,
      type: 'pizza',
      ingredients: ['pomodoro', 'mozzarella di bufala'],
      tags: ['premium']
    }
  ],
  drinks: [
    {
      id: 'acqua-05',
      name: 'Acqua 0.5L',
      price: 150,
      type: 'drink'
    },
    {
      id: 'birra-05',
      name: 'Birra 0.5L',
      price: 500,
      type: 'drink'
    }
  ],
  extras: [
    {
      id: 'extra-olio',
      name: 'Olio extra',
      price: 50,
      type: 'extra'
    }
  ]
};

Object.keys(catalog || {}).forEach((section) => {
  if (Array.isArray(catalog[section])) {
    catalog[section] = catalog[section].map(normalizeItem);
  }
});

catalog.menu = Array.isArray(catalog.menu) ? catalog.menu : catalog.pizzas;
catalog.doughs = catalog.doughs || { normale: { surcharge_cents: 0 } };
catalog.size_engine = catalog.size_engine || { default: 'normale' };

module.exports = catalog;
