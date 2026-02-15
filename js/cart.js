// =====================================
//  CARRELLO DINAMICO – AL DOGE
// =====================================

// Carica carrello da localStorage
function getCarrello() {
  return JSON.parse(localStorage.getItem("carrello")) || [];
}

// Salva carrello
function salvaCarrello(carrello) {
  localStorage.setItem("carrello", JSON.stringify(carrello));
  aggiornaBadgeCarrello();
}

// Aggiungi prodotto
function aggiungiAlCarrello(idProdotto) {
  const carrello = getCarrello();
  const prodotto = prodotti.find(p => p.id === idProdotto);

  if (!prodotto) return;

  const esistente = carrello.find(item => item.id === idProdotto);

  if (esistente) {
    esistente.quantita++;
  } else {
    carrello.push({
      id: prodotto.id,
      nome: prodotto.nome,
      prezzo: prodotto.prezzo,
      quantita: 1
    });
  }

  salvaCarrello(carrello);
}

// Incrementa quantità
function incrementa(idProdotto) {
  const carrello = getCarrello();
  const item = carrello.find(i => i.id === idProdotto);
  if (item) item.quantita++;
  salvaCarrello(carrello);
}

// Decrementa quantità
function decrementa(idProdotto) {
  const carrello = getCarrello();
  const item = carrello.find(i => i.id === idProdotto);

  if (item) {
    item.quantita--;
    if (item.quantita <= 0) {
      rimuovi(idProdotto);
      return;
    }
  }

  salvaCarrello(carrello);
}

// Rimuovi prodotto
function rimuovi(idProdotto) {
  let carrello = getCarrello();
  carrello = carrello.filter(i => i.id !== idProdotto);
  salvaCarrello(carrello);
}

// Calcolo totale
function calcolaTotale() {
  const carrello = getCarrello();
  return carrello.reduce((sum, item) => sum + item.prezzo * item.quantita, 0);
}

// Badge carrello
function aggiornaBadgeCarrello() {
  const carrello = getCarrello();
  const totaleQuantita = carrello.reduce((sum, item) => sum + item.quantita, 0);

  const badge = document.getElementById("badge-carrello");
  if (badge) badge.textContent = totaleQuantita;
}

// Svuota carrello dopo ordine
function svuotaCarrello() {
  localStorage.removeItem("carrello");
  aggiornaBadgeCarrello();
}

// Aggiorna badge al caricamento pagina
document.addEventListener("DOMContentLoaded", aggiornaBadgeCarrello);
