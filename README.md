# 🍕 AL DOGE - Sistema Ordini Online Completo

Sistema completo di ordini online per pizzeria con menu pizze, creatore panini AI, pagamento Stripe, notifiche Telegram e dashboard admin.

## 📋 Funzionalità Principali

### 1. **Homepage Moderna** (`home.html`)
- Design responsive con colori brand AL DOGE
- 2 bottoni principali: 🍕 PIZZE e 🥖 PANINI CUSTOM
- Carrello badge con counter articoli
- Sezione informativa features

### 2. **Menu Pizze Completo** (`pizze.html`)
- **35 pizze** tradizionali con prezzi (€5.50 - €10.00)
- Filtri per categoria (Classiche, Speciali, Piccanti)
- Ricerca per nome o ingredienti
- Controlli quantità integrati
- Visualizzazione allergeni
- Aggiungi al carrello con feedback visivo

### 3. **Panini Custom AI** (`panini-custom.html`)
- Chatbot AI per suggerimenti personalizzati
- 4 preset veloci:
  - 🥒 **Leggero** - verdure e formaggi leggeri
  - 🌶️ **Piccante** - carni e peperoncino
  - 🥬 **Vegetariano** - solo verdure e formaggi
  - 💪 **Proteico** - carni e proteine
- Input custom per richieste libere
- Selezione/modifica ingredienti interattiva
- Calcolo prezzo dinamico: **€5.00 base + €0.50/ingrediente**

### 4. **Carrello Unificato** (`carrello.html`)
- Visualizzazione pizze + panini ordinati
- Modifica quantità e rimozione articoli
- Calcolo totale automatico
- Riepilogo allergeni totali
- Pulsante checkout

### 5. **Checkout Completo** (`checkout.html`)
- **Step 1**: Dati cliente (nome, telefono, note)
- **Step 2**: Selezione orario ritiro (18:30-23:00, slot 15min)
- **Step 3**: Riepilogo ordine e pagamento
- Integrazione Stripe Payment (modalità test)
- Conferma ordine con numero

### 6. **Notifiche Telegram** (`netlify/functions/telegram-notify.js`)
- Bot Telegram per notifiche automatiche
- Messaggio formattato con dettagli ordine:
  - Nome, telefono, orario ritiro
  - Elenco articoli ordinati
  - Totale e status pagamento
  - Note cliente

### 7. **Dashboard Admin** (`admin-orders.html`)
- Accesso protetto con password: `aldoge2024`
- Statistiche in tempo reale (ordini oggi, incasso, pendenti)
- Lista ordini con filtri (data, status)
- Aggiornamento status ordini (In Attesa → In Preparazione → Pronto → Completato)
- Export CSV ordini
- Visualizzazione pagamenti tavolo

### 8. **QR Code Pagamento Tavolo** (`pay.html` + `qr-generator.html`)
- Sistema QR per 10 tavoli
- Cliente inquadra QR → pagina pagamento
- Importi predefiniti (€10, €20, €30, €40, €50, €100)
- Input importo personalizzato
- Pagamento Stripe + notifica Telegram
- Generatore QR con download e stampa

## 🚀 Setup e Installazione

### 1. **Clone Repository**
```bash
git clone https://github.com/aldoge2022-lab/al-doge-site.git
cd al-doge-site
```

### 2. **Deploy su Netlify**

Il sito è già configurato per Netlify (vedi `netlify.toml`).

**Metodo 1: Deploy automatico da GitHub**
1. Collega il repository a Netlify
2. Netlify rileverà automaticamente la configurazione
3. Deploy automatico ad ogni push

**Metodo 2: Deploy manuale**
```bash
npm install -g netlify-cli
netlify deploy --prod
```

### 3. **Configurazione Environment Variables**

Vai su Netlify Dashboard → Site Settings → Environment Variables e aggiungi:

#### Telegram Bot (Obbligatorio per notifiche)
```
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=-1001234567890
```

**Come ottenere:**
1. Apri Telegram e cerca `@BotFather`
2. Invia `/newbot` e segui le istruzioni
3. Copia il token ricevuto
4. Aggiungi il bot al gruppo dipendenti
5. Per ottenere CHAT_ID, cerca `@RawDataBot` nel gruppo, ti darà l'ID

#### Groq AI (Opzionale per panini AI)
```
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxx
```

**Come ottenere:**
1. Vai su https://console.groq.com
2. Crea account gratuito
3. Genera API Key
4. Copia e incolla nelle environment variables

#### Stripe (Per pagamenti)
```
STRIPE_PUBLIC_KEY=pk_test_xxxxxxxxxxxx
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxx
```

**Setup Stripe:**
1. Crea account su https://stripe.com
2. Vai in Developer → API Keys
3. Copia Public Key e Secret Key (usa TEST mode per sviluppo)
4. Per produzione, attiva account e usa LIVE keys

### 4. **Setup Firebase/Firestore (Opzionale)**

Per salvare ordini su database cloud invece che localStorage:

1. Crea progetto su https://firebase.google.com
2. Attiva Firestore Database
3. Copia configurazione Firebase
4. Modifica `checkout.html` per salvare su Firestore invece di localStorage

## 📱 Come Usare il Sistema

### Per Clienti:

1. **Ordinare Pizze:**
   - Vai su `home.html` → "MENU PIZZE"
   - Sfoglia le 35 pizze disponibili
   - Usa filtri per trovare la pizza perfetta
   - Seleziona quantità e aggiungi al carrello
   - Procedi al checkout

2. **Creare Panino Custom:**
   - Vai su `home.html` → "PANINI CUSTOM AI"
   - Scegli un preset o descrivi cosa vuoi
   - L'AI suggerisce ingredienti
   - Modifica a piacere ingredienti
   - Aggiungi al carrello

3. **Completare Ordine:**
   - Rivedi carrello
   - Inserisci dati (nome, telefono)
   - Seleziona orario ritiro
   - Paga con carta
   - Ricevi conferma

4. **Pagare al Tavolo:**
   - Scansiona QR code sul tavolo
   - Seleziona importo
   - Paga con carta
   - Staff riceve notifica

### Per Staff/Admin:

1. **Accedere Admin Dashboard:**
   - Vai su `/admin-orders.html`
   - Password: `aldoge2024`

2. **Gestire Ordini:**
   - Visualizza ordini in tempo reale
   - Filtra per data e status
   - Aggiorna status ordini
   - Esporta dati CSV

3. **Generare QR Tavoli:**
   - Vai su `/qr-generator.html`
   - Scarica PNG per ogni tavolo
   - Oppure stampa tutti insieme
   - Esponi QR sui tavoli

## 🧪 Testing

### Test Locale
1. Apri `home.html` nel browser
2. Aggiungi articoli al carrello
3. Completa checkout (usa modalità test Stripe)
4. Verifica notifiche Telegram

### Test su Netlify
```bash
netlify dev
```
Testa le Netlify Functions localmente prima del deploy.

### Checklist Test Completo:
- [ ] Menu pizze carica correttamente
- [ ] Chatbot AI panini funziona
- [ ] Carrello calcola prezzi corretti
- [ ] Checkout step 1-2-3 funzionano
- [ ] Pagamento Stripe test funziona
- [ ] Notifiche Telegram arrivano
- [ ] Dashboard mostra ordini
- [ ] QR Code pagamento funziona
- [ ] Responsive mobile (iPhone, Android)

## 📊 Struttura Files

```
al-doge-site/
├── home.html              # Homepage con 2 bottoni principali
├── pizze.html             # Menu 35 pizze con filtri
├── panini-custom.html     # Creatore panini AI
├── carrello.html          # Carrello unificato
├── checkout.html          # Checkout 3 step + Stripe
├── pay.html               # Pagamento QR tavolo
├── admin-orders.html      # Dashboard gestione ordini
├── qr-generator.html      # Generatore QR tavoli
├── cart-utils.js          # Utilità gestione carrello
├── menu.json              # Database 35 pizze
├── netlify/
│   └── functions/
│       ├── groq-panini.js      # AI panini custom
│       ├── telegram-notify.js  # Notifiche Telegram
│       ├── ai-chatbot.js       # Chatbot esistente
│       └── ai-consigli.js      # Consigli AI esistenti
├── netlify.toml           # Configurazione Netlify
└── README.md              # Questo file
```

## 🔐 Sicurezza

### Password Admin
- Password dashboard: `aldoge2024`
- **IMPORTANTE**: Cambiare in produzione editando `admin-orders.html` riga 442

### Stripe Keys
- Usare **TEST mode** per sviluppo
- Attivare **LIVE mode** solo per produzione
- Non committare secret keys nel codice

### Telegram Bot Token
- Mantenere segreto il token
- Non condividere pubblicamente
- Usare environment variables

## 🛠️ Personalizzazione

### Cambiare Colori Brand
Modifica variabili CSS in ogni file HTML:
```css
:root {
  --gold: #d4af37;    /* Oro principale */
  --dark: #0b0b0b;    /* Sfondo scuro */
  --soft: #1a1a1a;    /* Sfondo card */
}
```

### Modificare Orari Ritiro
In `checkout.html` riga 415:
```javascript
let hour = 18;  // Ora inizio
let minute = 30; // Minuti inizio
while (hour < 23) // Ora fine
```

### Aggiungere/Rimuovere Pizze
Modifica `menu.json` seguendo il formato esistente.

## 📞 Supporto

- **Email**: aldoge2022@gmail.com
- **Telefono**: 0432-1840683
- **Indirizzo**: Via S. Daniele 3, Farla di Majano (UD)

## 📄 License

© 2026 AL DOGE - Tutti i diritti riservati

---

**Sviluppato con ❤️ per AL DOGE Pizzeria**
