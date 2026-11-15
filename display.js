// The display: a read-only scoreboard for a room, for a TV, tablet or laptop that everyone at the table can see.
(() => {
  "use strict";

  const { glitch, react } = window.DataSlateFx;

  const params = new URLSearchParams(location.search);
  const roomsAvailable =
    location.protocol !== "file:" && (params.has("emulator") || Boolean(window.DATA_SLATE_FIREBASE?.apiKey));

  const SEATS = ["p1", "p2"];
  const FIELDS = ["primary", "secondary", "cp"];

  // ---------- DOM ----------

  const statusEl = document.querySelector("[data-status]");
  const roundEl = document.querySelector("[data-round]");
  const message = document.querySelector("[data-message]");
  const messageText = message.querySelector("[data-message-text]");
  const codeForm = message.querySelector("[data-code-form]");
  const playersEl = document.querySelector("[data-players]");
  const playerTpl = document.getElementById("player-tpl");

  // Player 1 on the left, player 2 on the right.
  const columns = Object.fromEntries(
    SEATS.map((seat, index) => {
      const el = playerTpl.content.firstElementChild.cloneNode(true);
      el.dataset.seat = seat;
      // Offset the second column's drifting highlights so the two sides never move in lockstep.
      if (index === 1) el.style.setProperty("--glow-offset", "-7s");
      playersEl.append(el);
      return [
        seat,
        {
          el,
          name: el.querySelector("[data-name]"),
          offline: el.querySelector("[data-offline]"),
          empty: el.querySelector("[data-empty]"),
          scores: el.querySelector("[data-scores]"),
          fields: Object.fromEntries(
            [...el.querySelectorAll("[data-field]")].map((field) => [field.dataset.field, field]),
          ),
        },
      ];
    }),
  );

  function showMessage(text, { askForCode = false } = {}) {
    messageText.textContent = text;
    codeForm.hidden = !askForCode;
    message.hidden = false;
    if (askForCode) codeForm.elements.code.focus();
  }

  codeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const code = codeForm.elements.code.value.trim().toUpperCase();
    if (!code) return;
    params.set("room", code);
    location.search = params.toString();
  });

  // ---------- Render ----------

  const total = (player) => (player?.primary || 0) + (player?.secondary || 0);

  function render({ round, players, connected }, previous) {
    statusEl.hidden = connected;
    roundEl.textContent = round;

    for (const seat of SEATS) {
      const player = players[seat];
      const column = columns[seat];
      column.empty.hidden = Boolean(player);
      column.scores.hidden = !player;
      column.name.textContent = player?.name || `Player ${SEATS.indexOf(seat) + 1}`;
      const offline = Boolean(player && player.online === false);
      column.offline.hidden = !offline;
      column.el.classList.toggle("is-offline", offline);
      if (!player) continue;
      column.fields.total.textContent = total(player);
      for (const field of FIELDS) column.fields[field].textContent = player[field] || 0;
    }

    if (!previous) return;
    // The same cues as the phones: the skull glitches on round changes, CP gains and any score change,
    // and smiles or scowls when points go up or down.
    const scoreDeltas = SEATS.map((seat) => total(players[seat]) - total(previous.players[seat]));
    const cpGained = SEATS.some((seat) => (players[seat]?.cp || 0) > (previous.players[seat]?.cp || 0));
    const scoreDelta = scoreDeltas.find((delta) => delta !== 0);
    if (round !== previous.round || cpGained || scoreDelta) glitch();
    if (scoreDelta) react(scoreDelta > 0 ? "happy" : "angry");
  }

  // ---------- Keep the screen on ----------

  async function keepAwake() {
    try {
      await navigator.wakeLock?.request("screen");
    } catch {
      /* not supported or refused: the screen just follows its own sleep settings */
    }
  }

  // The lock is released whenever the page is hidden, so take it again on return.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) keepAwake();
  });

  // ---------- Start ----------

  async function start() {
    if (!roomsAvailable) {
      showMessage("Rooms aren't set up on this site yet.");
      return;
    }

    let api;
    try {
      api = await import("./room.js");
    } catch (error) {
      console.warn(error);
      showMessage("Couldn't load the display. Check the connection and reload.");
      return;
    }

    const raw = params.get("room");
    const code = api.normalizeCode(raw);
    if (!code) {
      showMessage(raw ? `${raw.toUpperCase()} isn't a room code.` : "Enter a room code to watch.", {
        askForCode: true,
      });
      return;
    }

    document.title = `Room ${code} · Data Slate`;
    document.querySelectorAll("[data-code]").forEach((el) => {
      el.textContent = code;
    });

    try {
      await api.ready();
    } catch (error) {
      console.warn(error);
      showMessage("Couldn't connect. Check the connection and reload.");
      return;
    }

    let previous = null;
    api.watchRoom(code, (room) => {
      if (!room.exists) {
        previous = null;
        showMessage(`There's no room ${code}. Check the code.`, { askForCode: true });
        return;
      }
      message.hidden = true;
      render(room, previous);
      previous = room;
    });
    keepAwake();
  }

  start();
})();
