const { calculateSupplements } = require('../../../core/menu/food-engine');
const { parseCustomIngredients } = require('./services/customIngredientParser');
const { VALID_INGREDIENTS } = require('./schemas/orderSchemas');

const BASE_PRICE = Number(process.env.PANINO_BASE_PRICE || 5);

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function parseQty(message) {
  const normalized = normalizeText(message);
  const match = normalized.match(/\b(\d{1,2})\b/);
  const qty = match ? Number(match[1]) : 1;
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function getPaninoWhitelist() {
  return Array.from(VALID_INGREDIENTS);
}

function extractIngredients(message) {
  const whitelist = getPaninoWhitelist();
  const parsed = parseCustomIngredients({
    message,
    knownIngredients: whitelist,
    allowedIngredients: whitelist
  });

  return parsed.recognizedIngredients.filter(Boolean);
}

function buildPaninoItem(ingredients, qty) {
  const ingredientsExtra = calculateSupplements(ingredients);
  const unitPrice = Number((BASE_PRICE + ingredientsExtra).toFixed(2));

  return {
    type: 'PANINO',
    name: 'Panino Custom',
    ingredients,
    price: unitPrice,
    qty
  };
}

function getMaxIngredients() {
  const value = Number(process.env.PANINO_MAX_INGREDIENTS || 6);
  return Number.isFinite(value) && value > 0 ? value : 6;
}

function handlePanino({ message, intent }) {
  const ingredients = extractIngredients(message);
  const maxIngredients = getMaxIngredients();
  const effectiveIntent = intent === 'info' ? 'build' : intent;

  if (ingredients.length > maxIngredients) {
    return {
      ok: false,
      cartUpdates: [],
      reply: `Hai superato il massimo di ${maxIngredients} ingredienti consentiti per il panino.`,
      type: 'panino'
    };
  }

  if (effectiveIntent !== 'add' && effectiveIntent !== 'build') {
    return {
      ok: true,
      cartUpdates: [],
      reply: 'Posso creare un panino custom: dimmi "aggiungi panino" con gli ingredienti desiderati.',
      type: 'panino'
    };
  }

  if (ingredients.length === 0) {
    return {
      ok: true,
      cartUpdates: [],
      reply: 'Per creare un panino custom indicami almeno un ingrediente valido.',
      type: 'panino'
    };
  }

  const qty = parseQty(message);
  const cartItem = buildPaninoItem(ingredients, qty);

  return {
    ok: true,
    cartUpdates: [cartItem],
    reply: `Panino custom aggiunto (${qty}x) con ${ingredients.length} ingredienti.`,
    type: 'panino',
    item: {
      nome: cartItem.name,
      ingredienti: cartItem.ingredients,
      prezzo: cartItem.price,
      qty: cartItem.qty
    }
  };
}

module.exports = {
  handlePanino,
  extractIngredients,
  parseQty
};
