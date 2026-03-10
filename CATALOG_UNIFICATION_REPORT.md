# OFFICIAL CATALOG SOURCE

La **source of truth ufficiale** del catalogo AL DOGE è ora `menu.json`, consumata in modo canonico tramite `data/catalog.js` (normalizzazione server-side) e resa al frontend con `/.netlify/functions/catalog`.  
Tutti i consumer attivi (AI orchestrator ufficiale e pagina pizze) leggono da questa pipeline unica.

# DATA SOURCES DEPRECATED

- `data/catalog.js` non contiene più dati hardcoded: ora è solo adapter/normalizer di `menu.json`.
- `core/menu/food-core.json` resta solo come supporto legacy per supplementi/allergeni, non come catalogo prodotti.
- Ogni fetch frontend diretto a `menu.json` nel flusso attivo è stato rimosso a favore dell’endpoint ufficiale catalogo.

# FILES MODIFIED

- `data/catalog.js`
- `netlify/functions/catalog.js` (nuova)
- `netlify/functions/orchestrator-v3/panino-handler.js`
- `pizze.html`

# FRONTEND ALIGNMENT

- `pizze.html` usa esclusivamente `/.netlify/functions/catalog` per caricare i prodotti.
- Rendering e carrello usano i campi normalizzati (`id`, `name`, `category`, `price`, `ingredients`, `allergens`) dalla source unica.

# AI ALIGNMENT

- L’AI ufficiale (`netlify/functions/ai-orchestrator.js`) continua a passare da `orchestrator-v3/*`, che ora usa catalogo derivato da `menu.json` via `data/catalog.js`.
- Il flusso panino custom è stato riallineato agli ingredienti ufficiali catalogo (`VALID_INGREDIENTS`) invece di una whitelist separata non canonica.

# REMAINING RECOMMENDATION LIMITS

- I tag recommendation sono ancora principalmente derivati dalla categoria pizza; domini/tag avanzati non sono completi per tutti i prodotti.
- I supplementi ingredienti non presenti in `food-core` restano a sovrapprezzo zero finché non viene completato il mapping economico ingredienti.
- La recommendation è deterministica su ingredienti/tokens e non include ancora ranking nutrizionale completo.

# NEXT RECOMMENDED STEP

Consolidare in un unico file di dominio (es. `catalog-core.json`) anche metadati pricing/supplementi/allergeni ingredient-level, e fare migrare `food-engine` su quella stessa fonte per chiudere definitivamente ogni residua divergenza legacy.
