const menuSource = require('../menu.json');

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizePizza(item, index) {
  const name = String(item?.nome || '').trim();
  const category = String(item?.categoria || 'classica').trim().toLowerCase();
  const ingredients = normalizeArray(item?.ingredienti).map((value) => String(value).trim()).filter(Boolean);
  const allergens = normalizeArray(item?.allergeni);
  const id = slugify(name) || `pizza-${index + 1}`;
  const price = Number(item?.prezzo) || 0;
  const tags = unique([category]);

  return {
    id,
    name,
    category,
    price,
    ingredients,
    allergens,
    tags,
    domains: ['pizza'],
    type: 'pizza',
    ingredienti: ingredients,
    allergeni: allergens,
    prezzo: price,
    price_cents: price,
    base_price_cents: price,
    active: true
  };
}

const pizzas = normalizeArray(menuSource?.pizze).map(normalizePizza);

const catalog = {
  source: 'menu.json',
  menu: pizzas,
  pizzas,
  doughs: { normale: { surcharge_cents: 0 } },
  size_engine: { default: 'normale' }
};

module.exports = catalog;
