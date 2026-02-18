// Netlify Function per Groq AI - Suggerimenti Panini Personalizzati
// Necessita di GROQ_API_KEY nelle environment variables

exports.handler = async (event) => {
  // Gestione CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const { richiesta, preset } = JSON.parse(event.body);
    
    if (!richiesta && !preset) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Richiesta o preset richiesti',
          ingredienti: []
        })
      };
    }

    // Ingredienti disponibili
    const ingredientiDisponibili = [
      'pomodoro', 'mozzarella', 'prosciutto cotto', 'prosciutto crudo San Daniele',
      'funghi freschi', 'funghi porcini', 'origano', 'wurstel', 'acciughe', 
      'capperi', 'olive nere', 'olive taggiasche', 'patate fritte',
      'carciofi', 'peperoni', 'gorgonzola', 'brie', 'feta',
      'philadelphia', 'scamorza', 'mozzarella di Bufala', 'ricotta affumicata',
      'grana', 'cipolla', 'bresaola', 'speck', 'salamino piccante',
      'salsiccia', 'tonno', 'rucola', 'radicchio di Treviso', 'zucchine', 
      'pomodorini', 'mozzarelline', 'panna', 'peperoncino', 'aglio'
    ];

    let ingredientiSuggeriti = [];
    let descrizione = '';

    // Gestione preset predefiniti
    if (preset) {
      switch(preset) {
        case 'leggero':
          ingredientiSuggeriti = ['rucola', 'pomodorini', 'mozzarella', 'philadelphia'];
          descrizione = 'Panino leggero e fresco con verdure e formaggio delicato';
          break;
        case 'piccante':
          ingredientiSuggeriti = ['salamino piccante', 'peperoncino', 'mozzarella', 'cipolla'];
          descrizione = 'Panino piccante per veri amanti del fuoco!';
          break;
        case 'vegetariano':
          ingredientiSuggeriti = ['pomodoro', 'mozzarella', 'zucchine', 'peperoni', 'rucola'];
          descrizione = 'Panino vegetariano ricco di verdure fresche';
          break;
        case 'proteico':
          ingredientiSuggeriti = ['prosciutto crudo San Daniele', 'bresaola', 'grana', 'rucola'];
          descrizione = 'Panino proteico per sportivi e amanti della carne';
          break;
        default:
          ingredientiSuggeriti = ['prosciutto cotto', 'mozzarella', 'pomodoro'];
          descrizione = 'Panino classico AL DOGE';
      }
    } else {
      // Logica semplice basata su parole chiave (fallback se Groq non disponibile)
      const richiestaLower = richiesta.toLowerCase();
      
      if (richiestaLower.includes('legg') || richiestaLower.includes('diet')) {
        ingredientiSuggeriti = ['rucola', 'pomodorini', 'mozzarella', 'philadelphia'];
        descrizione = 'Panino leggero e fresco';
      } else if (richiestaLower.includes('piccant') || richiestaLower.includes('spicy')) {
        ingredientiSuggeriti = ['salamino piccante', 'peperoncino', 'mozzarella', 'cipolla'];
        descrizione = 'Panino piccante';
      } else if (richiestaLower.includes('veget') || richiestaLower.includes('verdur')) {
        ingredientiSuggeriti = ['pomodoro', 'mozzarella', 'zucchine', 'peperoni', 'rucola'];
        descrizione = 'Panino vegetariano';
      } else if (richiestaLower.includes('protein') || richiestaLower.includes('carn')) {
        ingredientiSuggeriti = ['prosciutto crudo San Daniele', 'bresaola', 'grana', 'rucola'];
        descrizione = 'Panino proteico';
      } else if (richiestaLower.includes('formag')) {
        ingredientiSuggeriti = ['mozzarella', 'gorgonzola', 'brie', 'grana'];
        descrizione = 'Panino ai formaggi';
      } else if (richiestaLower.includes('class') || richiestaLower.includes('semplic')) {
        ingredientiSuggeriti = ['prosciutto cotto', 'mozzarella', 'pomodoro', 'origano'];
        descrizione = 'Panino classico';
      } else {
        // Default: suggerimenti misti
        ingredientiSuggeriti = ['prosciutto crudo San Daniele', 'rucola', 'grana', 'pomodorini'];
        descrizione = 'Panino AL DOGE speciale';
      }
    }

    // Verifica che gli ingredienti siano disponibili
    ingredientiSuggeriti = ingredientiSuggeriti.filter(ing => 
      ingredientiDisponibili.includes(ing)
    );

    // Calcola prezzo
    const prezzoBase = 5.00;
    const prezzoIngredienti = ingredientiSuggeriti.length * 0.50;
    const prezzoTotale = prezzoBase + prezzoIngredienti;

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        ingredienti: ingredientiSuggeriti,
        descrizione: descrizione,
        prezzo: prezzoTotale,
        success: true
      })
    };

  } catch (error) {
    console.error('Errore Groq AI:', error);
    
    // Fallback in caso di errore
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredienti: ['prosciutto cotto', 'mozzarella', 'pomodoro'],
        descrizione: 'Panino classico (suggerimento default)',
        prezzo: 6.50,
        success: false,
        error: 'AI temporaneamente non disponibile'
      })
    };
  }
};
