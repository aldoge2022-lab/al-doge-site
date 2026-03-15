# MASTER CONFIRMED
- Homepage canonica unica: `index.html`.
- `home.html` deprecata e reindirizzata a `index.html`.
- Base AI ufficiale confermata: `netlify/functions/ai-orchestrator.js` + `netlify/functions/orchestrator-v3/*`.
- Set funzioni ufficiali attive ridotto a:
  - `netlify/functions/ai-orchestrator.js`
  - `netlify/functions/stripe-session.js`
  - `netlify/functions/telegram-notify.js`

# LEGACY COMPONENTS
- `netlify/functions/ai-engine.js` mantenuta solo come shim legacy, instrada ad `ai-orchestrator`.
- `pay.html` marcata come flusso legacy non affidabile (simulazione).

# ARCHIVED / DEPRECATED
- File Grok anomalo rimosso da `netlify/` e archiviato in `archive/legacy/grok-experimental-function.js`.
- `home.html` deprecata come homepage alternativa.

# OPEN ISSUES REMAINING
- Catalogo ancora frammentato (`menu.json`, `data/catalog.js`, `core/menu/food-core.json`, hardcoded).
- Flusso `pay.html` ancora incompleto: mancano scelta e gestione reale tra pagamento unico e pagamento diviso.
- Da fare successivamente: unificazione sorgente dati e allineamento recommendation deep logic.

# FINAL PROJECT STRUCTURE
- Frontend entrypoint: `index.html`
- Homepage legacy: `home.html` (redirect/deprecated)
- AI ufficiale: `netlify/functions/ai-orchestrator.js` + `netlify/functions/orchestrator-v3/*`
- Legacy AI shim: `netlify/functions/ai-engine.js`
- Payments: `netlify/functions/stripe-session.js`
- Notifications: `netlify/functions/telegram-notify.js`
- Legacy archiviati: `archive/legacy/*`
