exports.handler = async (event) => {
  try {
    const { message } = JSON.parse(event.body);
    
    if (!message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ reply: "Ciao! Come posso aiutarti?" })
      };
    }

    const testo = message.toLowerCase();
    let risposta = "";

    // Saluto
    if (testo.includes("ciao") || testo.includes("hello") || testo.includes("salve")) {
      risposta = "👋 Ciao! Benvenuto da AL DOGE! Sono l'assistente virtuale della pizzeria. Posso aiutarti con informazioni su orari, menu, indirizzo, prenotazioni e tanto altro. Cosa desideri sapere?";
    }
    // Indirizzo
    else if (testo.includes("dove") || testo.includes("indirizzo") || testo.includes("ubicazione") || testo.includes("location")) {
      risposta = "📍 **AL DOGE** si trova a:\n📮 Via S. Daniele 3, Farla di Majano (UD)\n🗺️ Facilmente raggiungibile da Majano centro. Vieni a trovarci!";
    }
    // Telefono
    else if (testo.includes("telefono") || testo.includes("numero") || testo.includes("chiama") || testo.includes("contatto")) {
      risposta = "📞 Per contattarci o ordinare:\n☎️ **0432-1840683**\nChiama pure, ti risponderemo al volo!";
    }
    // Orari
    else if (testo.includes("orari") || testo.includes("quando aperto") || testo.includes("aperto")) {
      risposta = "🕐 **Orari di apertura:**\n📅 Lunedì-Mercoledì: 11:00 - 23:00\n🌙 Giovedì-Domenica: 11:00 - 23:30\n⚠️ Chiusi il primo lunedì del mese\nVieni quando vuoi!";
    }
    // Menu e Pizze
    else if (testo.includes("menu") || testo.includes("pizza") || testo.includes("cosa") || testo.includes("cosa mangiate")) {
      risposta = "🍕 **Il nostro Menu:**\n\n**Pizze Classiche:** Margherita, Prosciutto, Viennese, Siciliana, Capricciosa, 4 Stagioni...\n**Pizze Speciali:** San Daniele (€12), Diavola (€9.50), Friulana (€10)...\n**Panino AL DOGE:** Impasto pizza con prosciutto crudo, rucola e formaggio (€8.50)\n\n💰 Prezzi da €7.50 a €12.00\n\nVisita il sito per il menu completo con tutti gli ingredienti!";
    }
    // Allergie
    else if (testo.includes("allergia") || testo.includes("allergeni") || testo.includes("glutine") || testo.includes("lattosio")) {
      risposta = "⚠️ **Informazioni Allergie:**\nTutte le nostre pizze contengono gluten (nel pane) e lattosio (mozzarella). Consulta il menu completo per gli allergeni specifici di ogni piatto.\n📞 Chiama lo 0432-1840683 per dettagli e opzioni alternative.";
    }
    // Asporto e Prenotazioni
    else if (testo.includes("asporto") || testo.includes("takeaway") || testo.includes("ordine") || testo.includes("prenotazione")) {
      risposta = "📦 **Asporto e Prenotazioni:**\n✅ Sì, facciamo asporto!\n✅ Accettiamo prenotazioni\n☎️ Chiama **0432-1840683** per ordinare o prenotare\n⏱️ Tempi di preparazione: 15-20 minuti";
    }
    // Bevande
    else if (testo.includes("bevande") || testo.includes("birra") || testo.includes("vino") || testo.includes("acqua") || testo.includes("coca")) {
      risposta = "🍺 **Bevande:**\n💧 Acqua naturale/frizzante (€1.50)\n🥤 Bibite: Coca Cola, Fanta, Sprite (€2.00)\n🍻 Birre: Malteus, IPA Ducato (€2.50-€4.00)\n🍷 Vino rosso 1/4 (€3.00)\n\nTutte le bevande servite fredde!";
    }
    // Domanda generica
    else {
      risposta = "🤔 Interessante domanda! Se cerchi info su menu, orari, posizione o prenotazioni, sono qui per aiutarti.\n\n💡 Prova a chiedermi:\n- Dove siete?\n- Quali sono gli orari?\n- Che pizze avete?\n- Come faccio a ordinare?\n\n📞 O chiama direttamente: 0432-1840683";
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ reply: risposta })
    };
  } catch (error) {
    console.error("Errore chatbot:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ reply: "Si è verificato un errore, riprova tra poco." })
    };
  }
};