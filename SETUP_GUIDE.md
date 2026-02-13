# 🚀 Guida Rapida Setup AL DOGE Sistema Ordini

## 📱 Per Staff - Configurazione Iniziale

### 1. Crea Bot Telegram (5 minuti)

**Step 1: Crea il bot**
1. Apri Telegram sul tuo telefono
2. Cerca `@BotFather`
3. Invia il comando: `/newbot`
4. Segui le istruzioni:
   - Nome bot: "AL DOGE Notifiche" (o quello che vuoi)
   - Username: "aldoge_notify_bot" (deve finire con _bot)
5. **SALVA IL TOKEN** che ti viene dato (es: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

**Step 2: Crea gruppo dipendenti**
1. Crea un nuovo gruppo su Telegram
2. Aggiungi i 4 dipendenti al gruppo
3. Aggiungi il bot che hai appena creato al gruppo
   - Cerca il nome del bot
   - Aggiungi come membro
4. Dai permessi di amministratore al bot

**Step 3: Ottieni ID del gruppo**
1. Nel gruppo, aggiungi `@RawDataBot`
2. Il bot ti manderà info del gruppo
3. Cerca "chat" → "id" (es: `-1001234567890`)
4. **SALVA QUESTO NUMERO**
5. Rimuovi @RawDataBot dal gruppo

### 2. Configura Netlify (10 minuti)

**Step 1: Collega GitHub a Netlify**
1. Vai su https://netlify.com
2. Registrati/Login
3. Clicca "Add new site" → "Import an existing project"
4. Scegli GitHub
5. Autorizza Netlify
6. Seleziona il repository `al-doge-site`
7. Clicca "Deploy site"

**Step 2: Aggiungi variabili ambiente**
1. Nella dashboard Netlify, vai su "Site settings"
2. Clicca "Environment variables"
3. Clicca "Add a variable"
4. Aggiungi queste 2 variabili:

```
Key: TELEGRAM_BOT_TOKEN
Value: [il token ricevuto da BotFather]

Key: TELEGRAM_CHAT_ID
Value: [l'ID del gruppo ricevuto da RawDataBot]
```

5. Clicca "Save"
6. Vai su "Deploys" e clicca "Trigger deploy" → "Clear cache and deploy site"

### 3. Test Sistema (5 minuti)

**Test ordine completo:**
1. Apri il sito su https://[tuo-sito].netlify.app
2. Clicca "MENU PIZZE"
3. Aggiungi una pizza al carrello
4. Vai al carrello
5. Clicca "Procedi al Checkout"
6. Compila i dati (puoi usare dati fittizi)
7. Seleziona data e orario
8. Clicca "Paga e Conferma"
9. **Verifica che arrivi notifica su Telegram!** ✅

### 4. Genera QR Code Tavoli (5 minuti)

1. Vai su https://[tuo-sito].netlify.app/qr-generator.html
2. La pagina mostrerà 10 QR codes (uno per tavolo)
3. Opzione 1: Scarica singolarmente
   - Clicca "Scarica PNG" sotto ogni QR
   - Stampa e plastifica
4. Opzione 2: Stampa tutti insieme
   - Clicca "Stampa Tutti i QR Code"
   - Stampa dalla finestra browser
   - Ritaglia e plastifica
5. Esponi i QR sui tavoli

**Test QR Code:**
1. Con il telefono, scansiona il QR del Tavolo 1
2. Dovrebbe aprire: https://[tuo-sito].netlify.app/pay.html?table=1
3. Seleziona un importo (es: €20)
4. Clicca "Paga Ora"
5. Verifica notifica Telegram con "PAGAMENTO TAVOLO #1" ✅

### 5. Accedi Dashboard Admin

1. Vai su https://[tuo-sito].netlify.app/admin-orders.html
2. Password: `aldoge2024`
3. Vedrai tutti gli ordini di test
4. Prova a cambiare lo status di un ordine

---

## 🔧 Setup Avanzato (Opzionale)

### Configura Stripe Pagamenti Reali

1. Vai su https://stripe.com e crea account
2. Completa verifica identità
3. Aggiungi IBAN: `IT08T36772223000EM002424663`
4. Email: `aldoge2022@gmail.com`
5. In Dashboard Stripe → Developer → API Keys
6. Copia le LIVE keys (non TEST)
7. Su Netlify → Environment Variables:
   ```
   STRIPE_PUBLIC_KEY=pk_live_xxxxx
   STRIPE_SECRET_KEY=sk_live_xxxxx
   ```
8. Modifica `checkout.html` riga 437: usa le LIVE keys
9. Rideploya sito

### Configura Groq AI (Panini Custom)

1. Vai su https://console.groq.com
2. Registrati gratuitamente
3. Crea API Key
4. Su Netlify → Environment Variables:
   ```
   GROQ_API_KEY=gsk_xxxxx
   ```
5. Rideploya sito
6. Test: Vai su Panini Custom e prova preset

---

## 📱 Come Usare il Sistema

### Per i Dipendenti:

**Ricevere ordini:**
- Tutti gli ordini arrivano automaticamente su Telegram
- Nessuna azione richiesta, solo leggere e preparare

**Gestire ordini:**
1. Vai su `/admin-orders.html`
2. Vedi lista ordini
3. Cambia status quando:
   - Inizi a preparare → "In Preparazione"
   - Finisci di preparare → "Pronto"
   - Cliente ritira → "Completato"

**Pagamenti tavolo:**
- Quando un cliente paga al tavolo, ricevi notifica Telegram
- Nessuna azione richiesta, solo confermare con cliente

### Per i Clienti:

**Ordinare online:**
1. Vai su sito AL DOGE
2. Scegli pizze o crea panino custom
3. Aggiungi al carrello
4. Checkout e paga
5. Ritira all'orario scelto

**Pagare al tavolo:**
1. Scansiona QR code sul tavolo
2. Inserisci importo
3. Paga con carta
4. Attendi personale

---

## ❓ Troubleshooting

**Notifiche Telegram non arrivano:**
1. Verifica che bot sia nel gruppo
2. Verifica che bot sia amministratore
3. Controlla environment variables su Netlify
4. Rideploya sito

**QR Code non funziona:**
1. Verifica che URL contenga `?table=X`
2. Controlla che sito sia online su Netlify
3. Rigenera QR da `/qr-generator.html`

**Dashboard non si apre:**
1. Password corretta: `aldoge2024`
2. Prova incognito mode
3. Cancella cache browser

---

## 📞 Supporto

Per problemi tecnici:
- Email: aldoge2022@gmail.com
- Tel: 0432-1840683

Per cambiare password admin, editare `admin-orders.html` riga 442.

---

✅ **Setup Completato!** Sistema pronto per ricevere ordini reali.
