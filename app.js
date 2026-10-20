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

  // ---------- Skull expressions ----------

  // Eye shapes from the interactionjackson.com skull (js/ij-skull.js); neutral is the one in assets/skull.svg.
  const EYES = {
    neutral:
      "M31.2261 45.4653C31.6552 50.1612 28.5443 54.0475 24.1461 54.3174C19.6943 54.5872 16.3152 51.5106 15.8861 46.9766C15.4034 42.2807 18.3534 38.1786 22.3225 37.6928C26.6134 37.207 30.7434 40.6075 31.2261 45.4653ZM55.5234 45.5193C55.3625 49.8374 51.9298 53.2378 47.5316 53.2918C43.348 53.3998 40.0225 50.4311 39.808 46.5448C39.5398 42.1188 43.0798 38.1786 46.888 37.7468C51.0716 37.261 55.738 40.6615 55.5234 45.5193Z",
    happy:
      "M19.8346 48.6128C19.0976 49.155 18.024 48.6546 18.2863 47.7781C20.2859 41.0988 29.3597 41.0349 31.6507 47.5864C31.961 48.4737 30.8562 49.0029 30.0958 48.4502C26.8297 46.0766 23.2086 46.1308 19.8346 48.6128ZM41.4859 48.4502C40.7255 49.0029 39.6207 48.4737 39.931 47.5864C42.222 41.0349 51.2958 41.0988 53.2953 47.7781C53.5577 48.6546 52.4841 49.155 51.7471 48.6128C48.373 46.1308 44.7519 46.0766 41.4859 48.4502Z",
    angry:
      "M17.7818 41.776C17.773 40.411 19.1977 39.5737 20.4468 40.1242L30.98 44.7659C31.7054 45.0856 32.1946 45.8071 32.0872 46.5925C31.5341 50.6391 28.3828 52.9841 24.4362 52.5456C20.202 52.1221 17.8215 47.9912 17.7818 41.776ZM53.8189 41.776C53.8276 40.411 52.403 39.5737 51.1539 40.1242L40.6207 44.7659C39.8953 45.0856 39.4061 45.8071 39.5134 46.5925C40.0666 50.6391 43.2179 52.9841 47.1644 52.5456C51.3986 52.1221 53.7791 47.9912 53.8189 41.776Z",
  };
  const BLINK_CLOSE_MS = 75;
  const BLINK_OPEN_MS = 125;
  // Long enough to read the face after the 320ms glitch; another point change restarts it.
  const MOOD_HOLD_MS = 900;

  const eyesEl = document.getElementById("skull-eyes");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  // The face the eyes are showing or blinking towards.
  let mood = "neutral";
  let moodTimer;
  let blinkFrame = 0;

  function paintEyes(next) {
    eyesEl.setAttribute("d", EYES[next]);
  }

  // The site's blink: the eyes squash shut, swap shape, then open, pivoting on a fixed line so they don't jump.
  function blinkTo(next) {
    if (next === mood) return;
    mood = next;
    cancelAnimationFrame(blinkFrame);
    eyesEl.removeAttribute("transform");
    if (reducedMotion.matches) {
      paintEyes(next);
      return;
    }
    const start = performance.now();
    let swapped = false;
    const tick = (now) => {
      const elapsed = now - start;
      let scale;
      if (elapsed < BLINK_CLOSE_MS) {
        scale = 1 - (elapsed / BLINK_CLOSE_MS) ** 2;
      } else {
        if (!swapped) {
          paintEyes(next);
          swapped = true;
        }
        scale = 1 - (1 - Math.min(1, (elapsed - BLINK_CLOSE_MS) / BLINK_OPEN_MS)) ** 3;
      }
      eyesEl.setAttribute("transform", `translate(0 46) scale(1 ${scale}) translate(0 -46)`);
      if (elapsed < BLINK_CLOSE_MS + BLINK_OPEN_MS) {
        blinkFrame = requestAnimationFrame(tick);
      } else {
        eyesEl.removeAttribute("transform");
        blinkFrame = 0;
      }
    };
    blinkFrame = requestAnimationFrame(tick);
  }

  function react(next) {
    clearTimeout(moodTimer);
    blinkTo(next);
    moodTimer = setTimeout(() => blinkTo("neutral"), MOOD_HOLD_MS);
  }

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
    if (key !== "cp" || delta > 0) glitch();
    // Only scoring points changes the face; round and command points just glitch.
    if (key === "primary" || key === "secondary") react(delta > 0 ? "happy" : "angry");
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
