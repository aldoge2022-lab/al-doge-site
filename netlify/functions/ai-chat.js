const MAX_MESSAGE_LENGTH = 500;

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    let payload;
    try {
      payload = JSON.parse(event.body);
    } catch (parseError) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Messaggio non valido" })
      };
    }

    const { message } = payload ?? {};

    if (typeof message !== "string" || message.trim().length === 0 || message.length > MAX_MESSAGE_LENGTH) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Messaggio non valido" })
      };
    }

    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Errore server AI" })
      };
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Sei l'assistente ufficiale della Pizzeria AL DOGE. Consiglia pizze e panini in modo professionale e convincente."
          },
          { role: "user", content: message }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI API error:", response.status);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: "Errore server AI" })
      };
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Errore server AI" })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        reply
      })
    };

  } catch (error) {
    console.error("AI chat handler error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Errore server AI" })
    };
  }
}
