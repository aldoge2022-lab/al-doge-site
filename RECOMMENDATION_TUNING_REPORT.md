# RECOMMENDATION LOGIC CHANGES

- Analizzato il flusso ufficiale in `netlify/functions/ai-orchestrator.js` e mantenuta l'architettura esistente (routing dominio/intento, recommendation deterministic, direct match, fallback LLM).
- Rafforzata la recommendation logic senza introdurre fonti dati parallele:
  - raccomandazioni ora leggono un catalogo combinato deduplicato (menu + bevande + eventuali panini) restando ancorate alla source of truth locale;
  - aggiunti helper per intent di tipo (pizza/panino/bibita) e per normalizzazione tipo prodotto;
  - migliorato rilevamento intent recommendation anche per frasi generiche tipo "non so cosa prendere".
- Migliorata la varietà: tie-break deterministico con seed sul messaggio, per ridurre vincitori sempre identici a parità di score.
- Migliorato bilanciamento combo: quando l’utente chiede pizza + bibita, l’algoritmo forza la presenza di entrambe tra i top suggerimenti se disponibili.

# SCORING / INTENT IMPROVEMENTS

- Introdotti pesi espliciti e leggibili (`RECOMMENDATION_WEIGHTS`) per:
  - match ingrediente esplicito (forte);
  - penalità assenza ingrediente richiesto;
  - preferenze piccante/vegetariana/leggera;
  - bilanciamento tipo su richieste generiche.
- Distinzione più netta tra:
  - **ingredient-based request** (`con tonno`, ecc.);
  - **richiesta generica** (`non so cosa prendere`, `consigliami qualcosa`).
- Potenziata estrazione ingredienti intent-based:
  - continua ad usare extractor ufficiale;
  - aggiunto fallback leggero dal testo libero per pattern `con ...` quando l'ingrediente non è nel vocabolario canonico.
- Ridotta incoerenza prompt-risposta:
  - se richiesta pizza/panino/bibita è esplicita, i relativi item ricevono boost dedicato;
  - su richiesta ingredient-based, item senza match reale vengono penalizzati.

# FALLBACK IMPROVEMENTS

- Evitato fallback troppo generico quando ci sono segnali utili.
- Se l’utente chiede ingredienti non presenti nel catalogo (es. tonno), la risposta:
  - dichiara esplicitamente che non ci sono match per quell’ingrediente;
  - propone alternative credibili dal catalogo (es. pizza + bibita economiche), senza inventare prodotti.
- Per richieste generiche, il sistema entra in recommendation mode invece di rispondere con il vecchio prompt "nome esatto pizza".

# FILES MODIFIED

- `netlify/functions/ai-orchestrator.js`
- `tests/recommendation-tuning.test.js`
- `RECOMMENDATION_TUNING_REPORT.md`

# VALIDATION CASES

Casi verificati con test automatici:

1. `voglio qualcosa con tonno`
2. `consigliami una pizza piccante`
3. `vorrei un panino con pollo`
4. `non so cosa prendere`
5. `voglio qualcosa di vegetariano`
6. `fammi un consiglio per una pizza e una bibita`

Verifiche incluse:
- coerenza risposta rispetto al prompt;
- suggerimenti presenti nel catalogo locale;
- rispetto ingredienti/preferenze quando presenti;
- fallback non prevalente in presenza di informazione sufficiente.

# REMAINING LIMITS

- Il catalogo runtime corrente (`data/catalog.js`) resta volutamente ridotto rispetto al `menu.json` esteso: la qualità dei suggerimenti dipende dalla copertura effettiva di questo dataset in produzione.
- La classificazione vegetariana è euristica su ingredienti/tag disponibili: migliora la pertinenza ma non sostituisce una tassonomia nutrizionale completa.
- Su ingredienti totalmente assenti dal catalogo (es. pollo, tonno in questo dataset), il sistema ora gestisce meglio il fallback ma non può proporre un match diretto inesistente.
