const test = require("node:test");
const assert = require("node:assert/strict");

const PizzaOptionEngine = require("../pizza-options");

test("pizza option engine applies format and supplements to final price", () => {
  const pizza = { nome: "Margherita", prezzo: 6, prezzo_maxi: 9 };

  const finalPrice = PizzaOptionEngine.calculatePizzaPrice(pizza, {
    format: "maxi",
    dough: "kamut",
    mozzarella: "senza-lattosio",
    extras: ["verdure", "affettati"]
  });

  assert.equal(finalPrice, 14);
});

test("pizza option engine keeps maxi disabled when maxi price is missing", () => {
  const pizza = { nome: "Diavola", prezzo: 8 };

  const normalized = PizzaOptionEngine.normalizeSelection({ format: "maxi" }, pizza);
  const finalPrice = PizzaOptionEngine.calculatePizzaPrice(pizza, normalized);

  assert.equal(normalized.format, "normale");
  assert.equal(finalPrice, 8);
});

test("createPizzaCartItem stores the selected product options", () => {
  const pizza = {
    nome: "Bufala",
    prezzo: 9,
    prezzo_maxi: 12,
    ingredienti: ["pomodoro", "mozzarella"],
    allergeni: [1, 7]
  };

  const cartItem = PizzaOptionEngine.createPizzaCartItem(pizza, 2, {
    format: "maxi",
    dough: "riso",
    mozzarella: "senza-lattosio",
    extras: ["burrata-bufala"]
  });

  assert.equal(cartItem.type, "pizza");
  assert.equal(cartItem.name, "Bufala");
  assert.equal(cartItem.quantity, 2);
  assert.equal(cartItem.price, 16.5);
  assert.equal(cartItem.format, "Maxi");
  assert.equal(cartItem.dough, "Farina di riso");
  assert.equal(cartItem.mozzarella, "Senza lattosio");
  assert.deepEqual(cartItem.extras, ["Burrata / bufala"]);
  assert.ok(cartItem.signature.includes("maxi"));
});
