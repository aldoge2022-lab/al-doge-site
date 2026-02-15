// ===============================
//  PRODOTTI AL DOGE – CENTRALIZZATI
// ===============================

const prodotti = [
  // PANINI
  {
    id: "panino_1",
    nome: "Doge Classico",
    categoria: "panini",
    prezzo: 8.00,
    ingredienti: ["Prosciutto crudo", "Mozzarella"]
  },
  {
    id: "panino_2",
    nome: "Doge Special",
    categoria: "panini",
    prezzo: 9.50,
    ingredienti: ["Speck", "Brie", "Rucola"]
  },
  {
    id: "panino_3",
    nome: "Vegano",
    categoria: "panini",
    prezzo: 7.50,
    ingredienti: ["Verdure grigliate", "Hummus"]
  },

  // PIZZE
  {
    id: "pizza_1",
    nome: "Margherita",
    categoria: "pizze",
    prezzo: 7.00,
    ingredienti: ["Pomodoro", "Mozzarella"]
  },
  {
    id: "pizza_2",
    nome: "Diavola",
    categoria: "pizze",
    prezzo: 8.50,
    ingredienti: ["Salame piccante", "Mozzarella"]
  },
  {
    id: "pizza_3",
    nome: "Prosciutto e Funghi",
    categoria: "pizze",
    prezzo: 9.00,
    ingredienti: ["Prosciutto cotto", "Funghi", "Mozzarella"]
  },

  // BEVANDE
  {
    id: "bevanda_1",
    nome: "Coca-Cola",
    categoria: "bevande",
    prezzo: 2.50
  },
  {
    id: "bevanda_2",
    nome: "Acqua Naturale",
    categoria: "bevande",
    prezzo: 1.50
  },
  {
    id: "bevanda_3",
    nome: "Birra Artigianale",
    categoria: "bevande",
    prezzo: 4.00
  }
];

// Esporta per altri file JS
if (typeof window !== "undefined") {
  window.prodotti = prodotti;
}
