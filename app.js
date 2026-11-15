(() => {
  "use strict";

  const { glitch, react } = window.DataSlateFx;

  const STORAGE_KEY = "data-slate:v1";
  // The room this device last joined ({ code }), so a reload or a locked phone drops back into it.
  const ROOM_KEY = "data-slate:room";
  const NAME_KEY = "data-slate:name";

  const COUNTERS = {
    round: { min: 1, max: 5, initial: 1, name: "Round" },
    cp: { min: 0, max: 99, initial: 0, name: "Command points" },
    primary: { min: 0, max: 99, initial: 0, name: "Primary" },
    secondary: { min: 0, max: 99, initial: 0, name: "Secondary" },
  };
  // What a player owns in a room. Round is shared, so Reset and Undo leave it alone there.
  const OWN_KEYS = ["cp", "primary", "secondary"];

  const initialState = () =>
    Object.fromEntries(Object.entries(COUNTERS).map(([key, c]) => [key, c.initial]));

  const clamp = (key, value) => Math.min(COUNTERS[key].max, Math.max(COUNTERS[key].min, value));

  const pick = (source, keys) => Object.fromEntries(keys.map((key) => [key, source[key]]));

  function readStored(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  }

  function writeStored(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode etc. — the game still works, it just won't survive a reload */
    }
  }

  function load() {
    const saved = readStored(STORAGE_KEY);
    const state = initialState();
    if (saved && typeof saved === "object") {
      for (const key of Object.keys(COUNTERS)) {
        if (Number.isFinite(saved[key])) state[key] = clamp(key, saved[key]);
      }
    }
    return state;
  }

  // The solo game. In a room the scores live in Firebase, and the solo game waits here for when you leave.
  function save() {
    writeStored(STORAGE_KEY, state);
  }

  let state = load();

  // ---------- Rooms ----------

  const params = new URLSearchParams(location.search);
  // Rooms need Firebase (firebase-config.js) and a page served over http(s): ES modules don't load from file://.
  const roomsAvailable =
    location.protocol !== "file:" && (params.has("emulator") || Boolean(window.DATA_SLATE_FIREBASE?.apiKey));

  // null in solo play. In a room: { api, code, seat, players, connected, loaded, stop }.
  let room = null;
  let roomApi;

  // room.js pulls in Firebase, so it only loads once someone opens the Room sheet or follows a room link.
  function loadRoomApi() {
    roomApi ??= import("./room.js").catch((error) => {
      roomApi = undefined;
      throw error;
    });
    return roomApi;
  }

  const otherSeat = (seat) => (seat === "p1" ? "p2" : "p1");

  // ---------- DOM ----------

  const stepperTpl = document.getElementById("stepper-tpl");
  const cards = {};

  document.querySelectorAll("[data-counter]").forEach((card) => {
    const key = card.dataset.counter;
    card.querySelector(".stepper").append(stepperTpl.content.cloneNode(true));
    const [minus, plus] = card.querySelectorAll(".step");
    const name = COUNTERS[key].name;
    minus.setAttribute("aria-label", `Decrease ${name}`);
    plus.setAttribute("aria-label", `Increase ${name}`);
    cards[key] = { value: card.querySelector("[data-value]"), minus, plus };
  });

  document.querySelectorAll("[data-max]").forEach((el) => {
    el.textContent = COUNTERS.round.max;
  });

  const totalEl = document.querySelector("[data-total]");
  const resetBtn = document.querySelector('[data-action="reset"]');
  const roomBtn = document.querySelector('[data-action="room"]');
  const roomLabel = roomBtn.querySelector("[data-room-label]");
  const opponentEl = document.querySelector("[data-opponent]");
  const toast = document.querySelector("[data-toast]");
  const toastText = toast.querySelector("[data-toast-text]");
  const undoBtn = toast.querySelector('[data-action="undo"]');
  let toastTimer;
  let undoAction = null;

  const sheet = document.querySelector("[data-sheet]");
  const sheetTitle = sheet.querySelector("[data-sheet-title]");
  const entryForm = sheet.querySelector("[data-sheet-entry]");
  const nameInput = entryForm.elements.name;
  const codeInput = entryForm.elements.code;
  const joinBtn = entryForm.querySelector('[value="join"]');
  const sheetError = sheet.querySelector("[data-sheet-error]");
  const roomStatus = sheet.querySelector("[data-room-status]");

  // ---------- Render ----------

  function render() {
    for (const [key, el] of Object.entries(cards)) {
      el.value.textContent = state[key];
      el.minus.disabled = state[key] <= COUNTERS[key].min;
      el.plus.disabled = state[key] >= COUNTERS[key].max;
    }
    totalEl.textContent = state.primary + state.secondary;
    const resettable = room ? OWN_KEYS : Object.keys(COUNTERS);
    resetBtn.disabled = resettable.every((key) => state[key] === COUNTERS[key].initial);
    renderRoom();
  }

  function renderRoom() {
    roomBtn.hidden = !roomsAvailable;
    roomBtn.classList.toggle("is-live", Boolean(room));
    roomBtn.classList.toggle("is-offline", Boolean(room && !room.connected));
    if (!room) {
      roomLabel.textContent = "Room";
      roomBtn.setAttribute("aria-label", "Play in a room");
      opponentEl.hidden = true;
      return;
    }

    roomLabel.textContent = room.code;
    roomBtn.setAttribute(
      "aria-label",
      `Room ${room.code}, ${room.connected ? "connected" : "offline"}. Room options`,
    );

    // One line about the other player: enough to see the room is live without becoming a second scoreboard.
    const opponent = room.players[otherSeat(room.seat)];
    opponentEl.hidden = !room.loaded;
    opponentEl.classList.toggle("is-offline", Boolean(opponent && opponent.online === false));
    if (!opponent) {
      opponentEl.replaceChildren(`Waiting for an opponent · code ${room.code}`);
    } else {
      const name = document.createElement("span");
      name.className = "opponent__name";
      name.textContent = opponent.name;
      const total = (opponent.primary || 0) + (opponent.secondary || 0);
      const parts = [` · ${total} pts · ${opponent.cp || 0} CP`];
      if (opponent.online === false) parts.push(" · offline");
      opponentEl.replaceChildren(name, ...parts);
    }

    if (sheet.open && sheet.dataset.variant === "room") renderRoomSheet();
  }

  function renderRoomSheet() {
    const seatName = room.players[room.seat]?.name || `Player ${room.seat === "p1" ? 1 : 2}`;
    roomStatus.textContent = room.connected
      ? `You're ${seatName} · Connected`
      : `You're ${seatName} · Offline. Your changes will sync when you reconnect.`;
    roomStatus.classList.toggle("is-offline", !room.connected);
  }

  // ---------- Actions ----------

  function commit(next) {
    state = next;
    if (!room) save();
    render();
  }

  function step(key, delta) {
    const value = clamp(key, state[key] + delta);
    if (value === state[key]) return;
    hideToast();
    commit({ ...state, [key]: value });
    if (room) {
      if (key === "round") room.api.stepRound(delta);
      else room.api.updateMine({ [key]: value });
    }
    if (key !== "cp" || delta > 0) glitch();
    // Only scoring points changes the face; round and command points just glitch.
    if (key === "primary" || key === "secondary") react(delta > 0 ? "happy" : "angry");
    if (navigator.vibrate) navigator.vibrate(8);
  }

  // Reset acts immediately; the toast's Undo is the safety net instead of a confirm dialog.
  // In a room it clears only your own scores: the round belongs to both players.
  function reset() {
    const before = state;
    if (room) {
      const api = room.api;
      const cleared = pick(initialState(), OWN_KEYS);
      commit({ ...state, ...cleared });
      api.updateMine(cleared);
      glitch();
      showToast("Your scores reset", () => {
        if (!room) return;
        const restored = pick(before, OWN_KEYS);
        commit({ ...state, ...restored });
        api.updateMine(restored);
        glitch();
      });
      return;
    }
    commit(initialState());
    glitch();
    showToast("Scores reset", () => {
      if (room) return;
      commit(before);
      glitch();
    });
  }

  function showToast(message, undo = null) {
    toastText.textContent = message;
    undoAction = undo;
    undoBtn.hidden = !undo;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 5000);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    undoAction = null;
    toast.hidden = true;
  }

  function undo() {
    const action = undoAction;
    hideToast();
    action?.();
  }

  // ---------- Room mode ----------

  function enterRoom(api, { code, seat }) {
    if (room) room.stop();
    room = { api, code, seat, players: {}, connected: true, loaded: false, stop: () => {} };
    writeStored(ROOM_KEY, { code });
    // Until the room arrives, show a blank game rather than the solo one.
    state = initialState();
    hideToast();
    render();
    const joined = room;
    joined.stop = api.watchRoom(code, (snapshot) => {
      if (room === joined) applyRoom(snapshot);
    });
  }

  function applyRoom({ exists, round, players, connected }) {
    const mine = players[room.seat];
    if (!exists || !mine) {
      const code = leaveRoom();
      showToast(`Room ${code} is no longer available`);
      return;
    }

    const next = {
      round: clamp("round", round),
      ...Object.fromEntries(OWN_KEYS.map((key) => [key, clamp(key, Number(mine[key]) || 0)])),
    };

    // This phone's own taps already updated `state`, so any difference here came from elsewhere:
    // the other player moving the round or scoring, or this seat on another device.
    if (room.loaded) {
      const opponentKey = otherSeat(room.seat);
      const before = room.players[opponentKey] || {};
      const after = players[opponentKey] || {};
      const ownScoreDelta = next.primary + next.secondary - (state.primary + state.secondary);
      const opponentScored = ["primary", "secondary"].some((key) => before[key] !== after[key]);
      if (next.round !== state.round || next.cp > state.cp || ownScoreDelta || opponentScored) glitch();
      if (ownScoreDelta) react(ownScoreDelta > 0 ? "happy" : "angry");
    }

    room.players = players;
    room.connected = connected;
    room.loaded = true;
    state = next;
    render();
  }

  // Back to solo play, with the solo game as it was. Returns the code of the room left.
  function leaveRoom() {
    const { api, code, stop } = room;
    stop();
    api.leaveRoom();
    room = null;
    writeStored(ROOM_KEY, null);
    state = load();
    hideToast();
    render();
    return code;
  }

  async function rejoin(code) {
    try {
      const api = await loadRoomApi();
      enterRoom(api, await api.joinRoom(code, ""));
    } catch (error) {
      if (error?.code === "not-found" || error?.code === "full" || error?.code === "invalid-code") {
        writeStored(ROOM_KEY, null);
      }
      showToast(`Couldn't rejoin room ${code}`);
    }
  }

  function errorMessage(error, code) {
    switch (error?.code) {
      case "invalid-code":
        return "Room codes are 4 letters and numbers, like K7QX.";
      case "not-found":
        return `There's no room ${code}. Check the code and try again.`;
      case "full":
        return `Room ${code} already has two players. You can still watch it on a display.`;
      default:
        return "Couldn't connect. Check your connection and try again.";
    }
  }

  // ---------- Room sheet ----------

  // Variants: "entry" (create or join), "join" (arrived from a room link), "room" (options for the room you're in).
  function openSheet(variant, code = "") {
    sheet.dataset.variant = variant;
    sheet.querySelectorAll("[data-show]").forEach((el) => {
      el.hidden = !el.dataset.show.split(" ").includes(variant);
    });
    sheetError.hidden = true;
    joinBtn.classList.toggle("btn--primary", variant === "join");

    if (variant === "room") {
      sheetTitle.textContent = `Room ${room.code}`;
      renderRoomSheet();
    } else {
      sheetTitle.textContent = variant === "join" ? `Join room ${code}` : "Play in a room";
      codeInput.value = code;
      nameInput.value = readStored(NAME_KEY) || "";
      loadRoomApi().catch(() => {}); // warm up Firebase while they type
    }

    if (!sheet.open) sheet.showModal();
    if (variant !== "room" && !nameInput.value) nameInput.focus();
  }

  function closeSheet() {
    if (sheet.open) sheet.close();
  }

  // A room link has done its job once it's been acted on; the saved room handles reloads from here.
  function dropRoomLink() {
    if (!params.has("room")) return;
    params.delete("room");
    const query = params.toString();
    history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
  }

  sheet.addEventListener("close", dropRoomLink);

  // Tapping the dimmed backdrop closes the sheet.
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet) closeSheet();
  });

  function setBusy(busyBtn) {
    entryForm.querySelectorAll("button").forEach((btn) => {
      btn.disabled = Boolean(busyBtn);
      btn.dataset.label ??= btn.textContent;
      btn.textContent = btn === busyBtn ? "Connecting…" : btn.dataset.label;
    });
  }

  function showSheetError(message) {
    sheetError.textContent = message;
    sheetError.hidden = false;
  }

  async function submitEntry(intent, submitter) {
    const name = nameInput.value.trim();
    const code = codeInput.value.trim().toUpperCase();
    if (intent === "join" && !code) {
      showSheetError("Enter the room code from the other player's screen.");
      codeInput.focus();
      return;
    }
    writeStored(NAME_KEY, name || null);
    sheetError.hidden = true;
    setBusy(submitter);
    try {
      const api = await loadRoomApi();
      const joined = intent === "create" ? await api.createRoom(name) : await api.joinRoom(code, name);
      if (room) leaveRoom();
      enterRoom(api, joined);
      closeSheet();
      glitch();
      showToast(intent === "create" ? `Room ${joined.code} created. Tap it to invite` : `Joined room ${joined.code}`);
    } catch (error) {
      if (!error?.code || !["invalid-code", "not-found", "full"].includes(error.code)) console.warn(error);
      showSheetError(errorMessage(error, code));
    } finally {
      setBusy(null);
    }
  }

  entryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    // Pressing Enter in the code field means Join, even though Create is the form's first button.
    const submitter =
      document.activeElement === codeInput || !event.submitter ? joinBtn : event.submitter;
    const intent = sheet.dataset.variant === "join" ? "join" : submitter.value;
    submitEntry(intent, intent === "join" ? joinBtn : submitter);
  });

  async function watchInstead() {
    let api;
    try {
      api = await loadRoomApi();
    } catch {
      showSheetError(errorMessage(null));
      return;
    }
    const code = api.normalizeCode(codeInput.value);
    if (!code) {
      showSheetError("Enter a room code to watch, like K7QX.");
      codeInput.focus();
      return;
    }
    location.href = api.roomUrl("display.html", code);
  }

  async function copyLink(url, message) {
    try {
      await navigator.clipboard.writeText(url);
      showToast(message);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  async function invite() {
    const url = room.api.roomUrl("./", room.code);
    closeSheet();
    if (navigator.share) {
      try {
        await navigator.share({ title: "Data Slate", text: `Join my game in room ${room.code}`, url });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    copyLink(url, "Invite link copied");
  }

  // ---------- Events ----------

  document.addEventListener("click", (event) => {
    const stepBtn = event.target.closest("[data-step]");
    if (stepBtn) {
      step(stepBtn.closest("[data-counter]").dataset.counter, Number(stepBtn.dataset.step));
      return;
    }

    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;
    switch (actionEl.dataset.action) {
      case "reset":
        reset();
        break;
      case "undo":
        undo();
        break;
      case "room":
        openSheet(room ? "room" : "entry");
        break;
      case "close-sheet":
        closeSheet();
        break;
      case "watch":
        watchInstead();
        break;
      case "share-room":
        invite();
        break;
      case "copy-display": {
        const url = room.api.roomUrl("display.html", room.code);
        closeSheet();
        copyLink(url, "Display link copied");
        break;
      }
      case "leave-room": {
        closeSheet();
        const code = leaveRoom();
        glitch();
        showToast(`Left room ${code}`, () => rejoin(code));
        break;
      }
    }
  });

  render();

  // ---------- Boot into a room ----------

  if (roomsAvailable) {
    const linkCode = (params.get("room") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    const saved = readStored(ROOM_KEY);
    if (linkCode && linkCode === saved?.code) {
      dropRoomLink();
      rejoin(linkCode);
    } else if (linkCode) openSheet("join", linkCode);
    else if (saved?.code) rejoin(saved.code);
  }
})();
