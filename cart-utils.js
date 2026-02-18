// Utilità per gestione carrello AL DOGE

const CartManager = {
  // Ottieni carrello
  getCart: function() {
    return JSON.parse(localStorage.getItem('aldoge_cart') || '[]');
  },

  // Salva carrello
  saveCart: function(cart) {
    localStorage.setItem('aldoge_cart', JSON.stringify(cart));
    this.updateBadge();
  },

  // Aggiungi al carrello
  addItem: function(item) {
    let cart = this.getCart();
    cart.push(item);
    this.saveCart(cart);
  },

  // Rimuovi dal carrello
  removeItem: function(index) {
    let cart = this.getCart();
    cart.splice(index, 1);
    this.saveCart(cart);
  },

  // Aggiorna quantità
  updateQuantity: function(index, quantity) {
    let cart = this.getCart();
    if (quantity <= 0) {
      this.removeItem(index);
    } else {
      cart[index].quantity = quantity;
      this.saveCart(cart);
    }
  },

  // Calcola totale
  getTotal: function() {
    const cart = this.getCart();
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  },

  // Conta articoli
  getItemCount: function() {
    const cart = this.getCart();
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  },

  // Svuota carrello
  clearCart: function() {
    localStorage.removeItem('aldoge_cart');
    this.updateBadge();
  },

  // Aggiorna badge
  updateBadge: function() {
    const badge = document.getElementById('cart-badge');
    if (!badge) return;
    
    const count = this.getItemCount();
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  },

  // Ottieni tutti gli allergeni
  getAllergens: function() {
    const cart = this.getCart();
    const allergens = new Set();
    cart.forEach(item => {
      if (item.allergeni) {
        item.allergeni.forEach(a => allergens.add(a));
      }
    });
    return Array.from(allergens).sort((a, b) => a - b);
  }
};

// Ingredienti disponibili con prezzi
const INGREDIENTI_DISPONIBILI = [
  'pomodoro', 'mozzarella', 'prosciutto cotto', 'prosciutto crudo San Daniele',
  'funghi freschi', 'funghi porcini', 'origano', 'wurstel', 'acciughe', 
  'capperi', 'olive nere', 'olive verdi', 'olive taggiasche', 'patate fritte',
  'patate al forno', 'carciofi', 'peperoni', 'gorgonzola', 'brie', 'feta',
  'philadelphia', 'scamorza', 'mozzarella di Bufala', 'ricotta affumicata',
  'grana', 'cipolla', 'bresaola', 'speck', 'salamino piccante', 'salame dolce',
  'salsiccia', 'tonno', 'rucola', 'radicchio di Treviso', 'zucchine', 
  'pomodorini', 'mozzarelline', 'panna', 'peperoncino', 'aglio', 'fagioli',
  'purea di zucca', 'asparagi'
];

const PREZZO_BASE_PANINO = 5.00;
const PREZZO_INGREDIENTE = 0.50;
