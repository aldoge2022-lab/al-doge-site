<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Assistente AL DOGE</title>

  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f4f4f4;
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    header {
      background: #111;
      color: white;
      padding: 15px;
      text-align: center;
      font-size: 20px;
      font-weight: bold;
    }

    #chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 15px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .message {
      max-width: 80%;
      padding: 12px 15px;
      border-radius: 12px;
      line-height: 1.4;
      font-size: 16px;
    }

    .user {
      align-self: flex-end;
      background: #d1e7ff;
    }

    .bot {
      align-self: flex-start;
      background: white;
      border: 1px solid #ddd;
    }

    #input-area {
      display: flex;
      padding: 10px;
      background: white;
      border-top: 1px solid #ccc;
    }

    #user-input {
      flex: 1;
      padding: 12px;
      border: 1px solid #ccc;
      border-radius: 8px;
      font-size: 16px;
    }

    #send-btn {
      margin-left: 10px;
      padding: 12px 18px;
      background: #111;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
    }

    #send-btn:hover {
      background: #333;
    }
  </style>
</head>

<body>
  <header>Assistente AL DOGE</header>

  <div id="chat-container"></div>

  <div id="input-area">
    <input
      type="text"
      id="user-input"
      placeholder="Scrivi un messaggio... (es. “Sono a dieta, cosa mi consigli?”)"
    />
    <button id="send-btn">Invia</button>
  </div>

  <script>
    const chatContainer = document.getElementById("chat-container");
    const input = document.getElementById("user-input");
    const sendBtn = document.getElementById("send-btn");

    function addMessage(text, sender) {
      const msg = document.createElement("div");
      msg.classList.add("message", sender);
      msg.textContent = text;
      chatContainer.appendChild(msg);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    async function sendMessage() {
      const text = input.value.trim();
      if (!text) return;

      addMessage(text, "user");
      input.value = "";

      addMessage("Sto pensando...", "bot");

      try {
        const response = await fetch("/.netlify/functions/ai-chatbot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });

        const data = await response.json();

        // Rimuove "Sto pensando..."
        chatContainer.removeChild(chatContainer.lastChild);

        addMessage(data.reply || "Non riesco a rispondere in questo momento.", "bot");
      } catch (e) {
        chatContainer.removeChild(chatContainer.lastChild);
        addMessage("Si è verificato un errore, riprova tra poco.", "bot");
      }
    }

    sendBtn.addEventListener("click", sendMessage);
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") sendMessage();
    });
  </script>
</body>
</html>
