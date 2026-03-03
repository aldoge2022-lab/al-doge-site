const catalog = require('../../../data/catalog');

const QTY_WORDS = Object.freeze({
  un: 1,
  uno: 1,
  una: 1,
  due: 2,
  tre: 3,
  quattro: 4,
  cinque: 5,
  sei: 6,
  sette: 7,
  otto: 8,
  nove: 9,
  dieci: 10
});

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function getMenuItems() {
  return Array.isArray(catalog.menu) ? catalog.menu : [];
}

function parseQty(message) {
  const normalized = normalizeText(message);
  const digitMatch = normalized.match(/\b(\d{1,2})\b/);
  if (digitMatch) {
    const qty = Number(digitMatch[1]);
    if (Number.isFinite(qty) && qty > 0) {
      return qty;
    }
  }

  const words = normalized.split(/\s+/);
  for (const word of words) {
    if (QTY_WORDS[word]) {
      return QTY_WORDS[word];
    }
  }

  return 1;
}

function findPizza(message) {
  const normalized = normalizeText(message);
  const activeItems = getMenuItems().filter((item) => item.active !== false);

  let exact = activeItems.find((item) => {
    const id = normalizeText(item.id);
    const name = normalizeText(item.name);
    return normalized.includes(id) || normalized.includes(name);
  });

  if (exact) {
    return exact;
  }

  let fuzzy = null;
  let fuzzyScore = 0;

  activeItems.forEach((item) => {
    const name = normalizeText(item.name);
    const id = normalizeText(item.id);

    if (name && (name.includes(normalized) || normalized.includes(name))) {
      const score = Math.max(name.length, normalized.length);
      if (score > fuzzyScore) {
        fuzzy = item;
        fuzzyScore = score;
      }
      return;
    }

    if (id && (id.includes(normalized) || normalized.includes(id))) {
      const score = Math.max(id.length, normalized.length);
      if (score > fuzzyScore) {
        fuzzy = item;
        fuzzyScore = score;
      }
    }
  });

  return fuzzy;
}

function toMenuCartItem(pizza, qty) {
  return {
    type: 'MENU_ITEM',
    id: String(pizza.id),
    name: String(pizza.name),
    price: Number(pizza.price) || 0,
    qty
  };
}

function handleMenu({ message, intent }) {
  if (intent === 'suggest') {
    const suggestions = getMenuItems()
      .filter((item) => item.active !== false)
      .slice(0, 3)
      .map((item) => item.name)
      .join(', ');

    return {
      ok: true,
      cartUpdates: [],
      reply: suggestions ? `Ti consiglio: ${suggestions}.` : 'Menu non disponibile al momento.',
      type: 'pizza'
    };
  }

  if (intent !== 'add' && intent !== 'build') {
    return {
      ok: true,
      cartUpdates: [],
      reply: 'Posso aggiungere una pizza al carrello se mi indichi nome e quantità.',
      type: 'pizza'
    };
  }

  const pizza = findPizza(message);
  if (!pizza) {
    return {
      ok: false,
      cartUpdates: [],
      reply: 'Pizza non trovata nel menu attuale. Indica un nome pizza valido.',
      type: 'pizza'
    };
  }

  const qty = parseQty(message);
  return {
    ok: true,
    cartUpdates: [toMenuCartItem(pizza, qty)],
    reply: `${pizza.name} aggiunta al carrello (${qty}x).`,
    type: 'pizza',
    item: {
      nome: pizza.name,
      ingredienti: Array.isArray(pizza.ingredients) ? pizza.ingredients : [],
      prezzo: Number(pizza.price) || 0,
      qty
    }
  };
}

module.exports = {
  handleMenu,
  parseQty,
  findPizza
};
