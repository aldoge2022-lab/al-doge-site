exports.handler = async (event) => {
  try {
    const { richiesta } = JSON.parse(event.body);
    
    if (!richiesta) {
      return {
        statusCode: 400,
        body: JSON.stringify({ risposta: "Per favore, descrivi cosa cerchi." })
      };
    }

    const testo = richiesta.toLowerCase();
    let consiglio = "";

    if (testo.includes("dieta") || testo.includes("leggera") || testo.includes("light")) {
      consiglio = "🌱 Perfetto! La **Marinara** è la scelta migliore per te: solo pomodoro, aglio e origano. Leggera e delizionsa! Prezzo: **€7.50**";
    } else if (testo.includes("proteica") || testo.includes("proteina") || testo.includes("muscoli")) {
      consiglio = "💪 Ottimo! La **San Daniele** è ricca di proteine con prosciutto crudo San Daniele. Perfetta per chi vuole nutrirsi bene! Prezzo: **€12.00**";
    } else if (testo.includes("piccante") || testo.includes("peperoncino") || testo.includes("spicy")) {
      consiglio = "🔥 Che coraggio! La **Diavola** è per i veri amanti del piccante: mozzarella, salamino piccante e peperoncino. Fuoco in bocca! Prezzo: **€9.50**";
    } else if (testo.includes("formaggio") || testo.includes("formaggi")) {
      consiglio = "🧀 Delizia per palati raffinati! La **4 Formaggi** con mozzarella, gorgonzola, formaggi misti è un'esplosione di sapori. Prezzo: **€11.00**";
    } else if (testo.includes("verdure") || testo.includes("verdura") || testo.includes("vegetariana")) {
      consiglio = "🥬 Scelta consapevole! La **Capricciosa** con verdure fresche, prosciutto e funghi è equilibrata e gustosa. Prezzo: **€10.50**";
    } else if (testo.includes("panino")) {
      consiglio = "🥖 Ottimo! Il **Panino AL DOGE** è artigianale con impasto pizza, prosciutto crudo San Daniele, rucola e crema di formaggio. Prezzo: **€8.50**";
    } else if (testo.includes("classica") || testo.includes("tradizionale")) {
      consiglio = "👑 Non sbagliare mai! La **Margherita** classica: pomodoro, mozzarella, origano. Semplice e perfetta. Prezzo: **€8.50**";
    } else {
      consiglio = "🍕 Non ho capito bene, ma ti consiglio di provare la **Capricciosa** (€10.50) - è il nostro best seller! Oppure dimmi che tipo di pizza preferisci (leggera, piccante, con formaggi...) e ti aiutiamo.";
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ risposta: consiglio })
    };
  } catch (error) {
    console.error("Errore:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ risposta: "Errore nel processo. Riprova." })
    };
  }
};