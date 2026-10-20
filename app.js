(() => {
  "use strict";

  const STORAGE_KEY = "data-slate:v1";

  const COUNTERS = {
    round: { min: 1, max: 5, initial: 1, name: "Round" },
    cp: { min: 0, max: 99, initial: 0, name: "Command points" },
    primary: { min: 0, max: 99, initial: 0, name: "Primary" },
    secondary: { min: 0, max: 99, initial: 0, name: "Secondary" },
  };

  const initialState = () =>
    Object.fromEntries(Object.entries(COUNTERS).map(([key, c]) => [key, c.initial]));

  const clamp = (key, value) => Math.min(COUNTERS[key].max, Math.max(COUNTERS[key].min, value));

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved === "object") {
        const state = initialState();
        for (const key of Object.keys(COUNTERS)) {
          if (Number.isFinite(saved[key])) state[key] = clamp(key, saved[key]);
        }
        return state;
      }
    } catch {
      /* storage unavailable or corrupt: start fresh */
    }
    return initialState();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* private mode etc. — the game still works, it just won't survive a reload */
    }
  }

  let state = load();
  let beforeReset = null;

  // ---------- Grain ----------

  // One 128px tile of white specks at random strengths, drawn once and handed to the CSS as a data URL.
  function paintGrain() {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pixels = ctx.createImageData(size, size);
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
      pixels.data[i + 3] = Math.random() * 255;
    }
    ctx.putImageData(pixels, 0, 0);
    document.documentElement.style.setProperty("--noise", `url(${canvas.toDataURL()})`);
  }

  paintGrain();

  document.addEventListener("visibilitychange", () => {
    document.documentElement.classList.toggle("is-hidden", document.hidden);
  });

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

  const glitchEl = document.querySelector("[data-glitch]");
  const totalEl = document.querySelector("[data-total]");
  const resetBtn = document.querySelector('[data-action="reset"]');
  const toast = document.querySelector("[data-toast]");
  const toastText = toast.querySelector("[data-toast-text]");
  let toastTimer;

  // ---------- Render ----------

  function render() {
    for (const [key, el] of Object.entries(cards)) {
      el.value.textContent = state[key];
      el.minus.disabled = state[key] <= COUNTERS[key].min;
      el.plus.disabled = state[key] >= COUNTERS[key].max;
    }
    totalEl.textContent = state.primary + state.secondary;
    resetBtn.disabled = Object.keys(COUNTERS).every((key) => state[key] === COUNTERS[key].initial);
  }

  // Restart the skull's burst; the class comes off when the animation ends so the next one can play.
  function glitch() {
    glitchEl.classList.remove("is-glitching");
    void glitchEl.offsetWidth;
    glitchEl.classList.add("is-glitching");
  }

  glitchEl.addEventListener("animationend", (event) => {
    if (event.target.classList.contains("slate__mark")) glitchEl.classList.remove("is-glitching");
  });

  // ---------- Actions ----------

  function commit(next) {
    state = next;
    save();
    render();
  }

  function step(key, delta) {
    const value = clamp(key, state[key] + delta);
    if (value === state[key]) return;
    beforeReset = null;
    hideToast();
    commit({ ...state, [key]: value });
    if (key === "round") glitch();
    if (navigator.vibrate) navigator.vibrate(8);
  }

  // Reset acts immediately; the toast's Undo is the safety net instead of a confirm dialog.
  function reset() {
    beforeReset = state;
    commit(initialState());
    glitch();
    showToast("Scores reset");
  }

  function undoReset() {
    if (!beforeReset) return;
    commit(beforeReset);
    glitch();
    beforeReset = null;
    hideToast();
  }

  function showToast(message) {
    toastText.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 5000);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toast.hidden = true;
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
        undoReset();
        break;
    }
  });

  render();
})();
