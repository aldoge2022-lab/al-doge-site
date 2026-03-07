# Cleanup Audit Operativo — al-doge-site

Data audit: 2026-03-07  
Repo canonico analizzato: `al-doge-site`

## Mappatura sintetica

### Route/pagine pubbliche rilevate
- `/` → `index.html`
- `/home` → `home.html`
- `/pizze` → `pizze.html`
- `/carrello` → `carrello.html`
- `/checkout` → `checkout.html`
- `/pay` → `pay.html`
- `/admin-orders` → `admin-orders.html`
- `/qr-generator` → `qr-generator.html`
- `/chatbot` → `chatbot.html`
- `/panini-custom` e `/panini-custom.html` (legacy)

### Frontend che chiamano Netlify Functions AI/order/cart
- `panini-custom.html` → `/.netlify/functions/ai-orchestrator`
- `chatbot.html` → `/.netlify/functions/ai-orchestrator`
- `checkout.html` → `/.netlify/functions/telegram-notify`, `/.netlify/functions/create-stripe-session` (nome endpoint legacy)
- `pay.html` → `/.netlify/functions/telegram-notify`

### Funzioni Netlify presenti nel repo
- `netlify/functions/ai-orchestrator.js`
- `netlify/functions/ai-engine.js`
- `netlify/functions/stripe-session.js`
- `netlify/functions/telegram-notify.js`
- moduli `netlify/functions/orchestrator-v3/*`

### File legacy collegati a `/panini-custom`
- `panini-custom.html`
- link in `index.html` e `home.html` (prima del cleanup)
- riferimenti documentali in `README.md`, `DELIVERABLES.md`, `SETUP_GUIDE.md`

### Duplicazioni rilevanti
- Doppia homepage (`index.html`, `home.html`) con CTA diverse.
- Flusso AI principale separato in pagina dedicata legacy (`panini-custom.html`).
- Doppia entry lato backend AI (`ai-engine.js` e `ai-orchestrator.js`), ma attivamente richiamato in frontend solo `ai-orchestrator`.

### Redirect già esistenti (prima del cleanup)
- Nessun redirect configurato in `netlify.toml`.

### Riferimenti richiesti (file chiave)
- `ai-orchestrator`: `panini-custom.html`, `chatbot.html`, `netlify/functions/ai-engine.js`, `tests/custom-ingredient-flows.test.js`
- `cartUpdates`: `netlify/functions/ai-orchestrator.js`, `netlify/functions/orchestrator-v3/*`, `tests/custom-ingredient-flows.test.js`
- `data.item` / `data.type`: `panini-custom.html` (contratto legacy frontend)
- `/panini-custom`: `index.html`, `home.html`, `README.md`, `DELIVERABLES.md`

---

## KEEP

| Path/Route/Funzione | Motivo | Rischio | Azione proposta |
|---|---|---|---|
| `index.html` (`/`) | Homepage canonica pubblica | Basso | Mantenere come entrypoint principale |
| `home.html` | Pagina promozionale esistente già usata internamente | Basso | Mantenere ma non promuovere legacy `/panini-custom` |
| `pizze.html`, `carrello.html`, `checkout.html`, `pay.html` | Flusso ordine/pagamento operativo | Medio | Nessuna modifica distruttiva |
| `netlify/functions/ai-orchestrator.js` + `orchestrator-v3/*` | Contratto backend canonico (`ok`, `reply`, `cartUpdates`) | Medio | Mantenere invariato |
| `netlify/functions/telegram-notify.js`, `netlify/functions/stripe-session.js` | Integrazioni reali ordine/pagamento/notifiche | Medio | Nessuna modifica distruttiva |
| `tests/custom-ingredient-flows.test.js` | Copertura parser ingredienti/orchestrator | Basso | Mantenere ed eseguire nei test mirati |

## REMOVE

| Path/Route/Funzione | Motivo | Rischio | Azione proposta |
|---|---|---|---|
| Promozione esplicita di `panini-custom.html` in homepage (`index.html`, `home.html`) | Mantiene una seconda UX legacy come percorso principale | Basso | Rimuovere CTA/link diretti verso route legacy |

## DEPRECATE

| Path/Route/Funzione | Motivo | Rischio | Azione proposta |
|---|---|---|---|
| `/panini-custom` e `/panini-custom.html` | Contratto frontend legacy basato su `data.type` + `data.item` | Basso-Medio | Redirect 301 verso `/` in `netlify.toml` |
| `panini-custom.html` (file) | Legacy utile come riferimento temporaneo, non come UX principale | Basso | Non rimuovere ora; considerare rimozione futura dopo monitoraggio traffico |
| Riferimenti documentali legacy (`README.md`, `DELIVERABLES.md`, `SETUP_GUIDE.md`) | Possono continuare a promuovere flusso deprecato | Basso | Aggiornare gradualmente documentazione, indicare deprecazione |

## VERIFY MANUALLY

| Path/Route/Funzione | Motivo | Rischio | Azione proposta |
|---|---|---|---|
| Redirect Netlify `/panini-custom* -> /` | Verifica effettiva solo in ambiente Netlify deployato | Medio | Testare su URL live/staging post-deploy |
| Checkout Stripe endpoint in `checkout.html` (`create-stripe-session`) | Possibile mismatch con funzione `stripe-session.js` | Medio | Verificare in produzione senza cambiare ora comportamento non richiesto |
| `chatbot.html` | Usa orchestrator ma non è collegato al flusso principale | Basso | Verificare se mantenerlo interno o deprecarlo in step successivo |
| Documenti operativi non allineati | Ambiguità architetturale residua | Basso | Allineamento completo documentazione in task dedicato |
