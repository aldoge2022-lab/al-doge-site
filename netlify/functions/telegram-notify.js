exports.handler = async (event) => {
  try {

    console.log("ENV TOKEN:", process.env.TELEGRAM_BOT_TOKEN);
    console.log("ENV CHAT:", process.env.TELEGRAM_CHAT_ID);
    console.log("BODY:", event.body);

    return {
      statusCode: 200,
      body: JSON.stringify({
        token: process.env.TELEGRAM_BOT_TOKEN ? "OK" : "MISSING",
        chat: process.env.TELEGRAM_CHAT_ID ? "OK" : "MISSING",
        body: event.body
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
