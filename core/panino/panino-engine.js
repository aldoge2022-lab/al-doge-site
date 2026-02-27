const { validatePaninoInput } = require('./panino-validator');
const { calculatePaninoPrice } = require('./panino-pricing');

function buildPanino(input = {}) {
  const validation = validatePaninoInput(input);

  if (!validation.ok) {
    return {
      ok: false,
      error: validation.error,
    };
  }

  const price = calculatePaninoPrice(validation.ingredients);

  return {
    ok: true,
    panino: {
      ingredients: validation.ingredients,
      price,
    },
  };
}

module.exports = {
  buildPanino,
};
