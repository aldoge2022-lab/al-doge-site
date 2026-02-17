const VOTE_KEY = "aldoge_vote_week"; // blocca 1 voto per settimana per dispositivo

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

async function loadPizzaGiorno() {
  const el = document.getElementById("pizza-giorno-content");
  try {
    const res = await fetch("/.netlify/functions/pizza-giorno");
    if (!res.ok) throw new Error("bad response");
    const data = await res.json();

    el.innerHTML = `
      <div><strong class="gold">${escapeHtml(data.pizza.nome)}</strong></div>
      <div class="meta">${escapeHtml(data.pizza.ingredienti)}</div>
      <div class="desc">${escapeHtml(data.pizza.descrizione)}</div>
    `;
  } catch {
    el.textContent = "Non disponibile in questo momento.";
  }
}

async function loadPizzeSettimana() {
  const container = document.getElementById("pizze-settimana");
  const status = document.getElementById("vote-status");
  container.innerHTML = "";
  status.textContent = "";

  try {
    const res = await fetch("/.netlify/functions/pizze-settimana");
    if (!res.ok) throw new Error("bad response");
    const data = await res.json();

    const votedWeek = localStorage.getItem(VOTE_KEY);
    const hasVoted = votedWeek === data.week_id;

    data.pizze.forEach(p => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <h3>${escapeHtml(p.nome)}</h3>
        <p class="meta">${escapeHtml(p.ingredienti)}</p>
        <p class="desc">${escapeHtml(p.descrizione)}</p>
        <div class="row">
          <button class="btn" ${hasVoted ? "disabled" : ""} data-pizza="${escapeHtml(p.id)}">
            ${hasVoted ? "Scelta registrata" : "Scegli questa pizza"}
          </button>
          <span class="badge">${p.voti} scelte</span>
        </div>
      `;
      container.appendChild(card);
    });

    container.querySelectorAll("button[data-pizza]").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          btn.disabled = true;
          btn.textContent = "Scelta registrata";

          const pizzaId = btn.getAttribute("data-pizza");
          const voteRes = await fetch("/.netlify/functions/voto", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pizza_id: pizzaId, week_id: data.week_id })
          });

          if (!voteRes.ok) throw new Error("vote failed");

          localStorage.setItem(VOTE_KEY, data.week_id);
          await loadPizzeSettimana();
          status.textContent = "Grazie: la tua scelta è stata registrata.";
        } catch {
          status.textContent = "Errore: riprova tra poco.";
        }
      });
    });

  } catch {
    status.textContent = "Non disponibile in questo momento.";
  }
}

loadPizzaGiorno();
loadPizzeSettimana();
