exports.handler = async (event) => {
  try {
    const data = JSON.parse(event.body);

    console.log("Ordine ricevuto:", data);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Errore server" }),
    };
  }
};
