const catalog = require('../../data/catalog');
const menuSource = require('../../menu.json');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

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

function normalizeSection(items, sectionId, sectionLabel) {
  return normalizeArray(items).map((entry, index) => {
    const name = String(entry?.nome || entry?.name || '').trim();
    if (!name) return null;
    const id = `${sectionId}-${slugify(name) || index + 1}`;
    const price = Number(entry?.prezzo ?? entry?.price ?? 0);
    const ingredients = normalizeArray(entry?.ingredienti || entry?.ingredients).map((value) => String(value).trim()).filter(Boolean);

    return {
      id,
      name,
      category: sectionLabel,
      price: Number.isFinite(price) ? price : 0,
      ingredients,
      type: 'menu_item'
    };
  }).filter(Boolean);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: HEADERS,
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: HEADERS,
      body: JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' })
    };
  }

  const pizzas = normalizeArray(catalog.pizzas || catalog.menu);
  const bevande = normalizeSection(menuSource?.bevande, 'bev', 'Bevande');
  const dolci = normalizeSection(menuSource?.dolci, 'dol', 'Dolci');
  const cucina = normalizeSection(menuSource?.cucina, 'cuc', 'Cucina');
  const tableItems = [...pizzas, ...bevande, ...dolci, ...cucina];

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({
      ok: true,
      source: catalog.source,
      items: pizzas,
      pizzas,
      bevande,
      dolci,
      cucina,
      tableItems
    })
  };
};
