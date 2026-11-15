// Rooms: the shared game two players score from their phones and the display watches.
// This is the only file that talks to Firebase. app.js and display.js import it lazily, so solo play never loads Firebase.
// Data shape and permissions: see database.rules.json and "Rooms" in README.md.

import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  getDatabase,
  connectDatabaseEmulator,
  ref,
  get,
  set,
  update,
  onValue,
  onDisconnect,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js";

export const SEATS = ["p1", "p2"];
export const ROUND = { min: 1, max: 5 };
export const SCORE_FIELDS = ["cp", "primary", "secondary"];
const NAME_MAX = 20;

// No I, O, 0 or 1, so a code read off a screen can't be mistyped. Keep in step with database.rules.json.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;

// ?emulator=1 points at the local Firebase emulators (see README.md) instead of the real project.
const emulator = new URLSearchParams(location.search).has("emulator");

const config = emulator
  ? {
      apiKey: "demo-key",
      projectId: "demo-dataslate",
      databaseURL: "http://127.0.0.1:9000?ns=demo-dataslate",
    }
  : window.DATA_SLATE_FIREBASE;

const app = initializeApp(config);
const auth = getAuth(app);
const db = getDatabase(app);
if (emulator) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectDatabaseEmulator(db, "127.0.0.1", 9000);
}

// ---------- Helpers ----------

export class RoomError extends Error {
  constructor(code) {
    super(code);
    this.code = code; // "not-found" | "full" | "invalid-code"
  }
}

export function normalizeCode(value) {
  const code = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

export function cleanName(value, seat) {
  const name = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX);
  return name || `Player ${SEATS.indexOf(seat) + 1}`;
}

// The link to a room on this site: the scorer (index.html) to join, or display.html to watch.
export function roomUrl(page, code) {
  const url = new URL(page, location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", code);
  if (emulator) url.searchParams.set("emulator", "1");
  return url.href;
}

const roomRef = (code, path = "") => ref(db, `rooms/${code}${path ? `/${path}` : ""}`);

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

const freshSeat = (uid, name) => ({ uid, name, cp: 0, primary: 0, secondary: 0, online: true });

// ---------- Auth ----------

// Every device signs in anonymously. The uid is what the rules use to tie a seat to a phone,
// and it survives reloads, so a player who refreshes gets their seat back.
let uidPromise;
export function ready() {
  uidPromise ??= new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      stop();
      resolve(user.uid);
    });
    signInAnonymously(auth).catch((error) => {
      stop();
      uidPromise = undefined;
      reject(error);
    });
  });
  return uidPromise;
}

// ---------- Joining ----------

// The seat this device holds: { code, seat }. Set by createRoom/joinRoom, cleared by leaveRoom.
let current = null;
let stopPresence = null;

export async function createRoom(name) {
  const uid = await ready();
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode();
    const result = await runTransaction(
      roomRef(code),
      (existing) => {
        if (existing !== null) return; // taken: abort and try another code
        return {
          createdAt: serverTimestamp(),
          round: ROUND.min,
          players: { p1: freshSeat(uid, cleanName(name, "p1")) },
        };
      },
      { applyLocally: false },
    );
    if (result.committed) return claim(code, "p1");
  }
  throw new Error("Couldn't find a free room code");
}

// Takes the seat this device already holds in the room, or the first free one.
export async function joinRoom(rawCode, name) {
  const code = normalizeCode(rawCode);
  if (!code) throw new RoomError("invalid-code");
  const uid = await ready();
  const snapshot = await get(roomRef(code));
  if (!snapshot.exists()) throw new RoomError("not-found");
  const players = snapshot.val().players || {};

  const mine = SEATS.find((seat) => players[seat]?.uid === uid);
  if (mine) {
    if (name && name.trim()) await set(roomRef(code, `players/${mine}/name`), cleanName(name, mine));
    return claim(code, mine);
  }

  for (const seat of SEATS) {
    if (players[seat]) continue;
    const result = await runTransaction(
      roomRef(code, `players/${seat}`),
      (existing) => (existing === null ? freshSeat(uid, cleanName(name, seat)) : undefined),
      { applyLocally: false },
    );
    if (result.committed) return claim(code, seat);
  }
  throw new RoomError("full");
}

// Marks this device online while it's connected; Firebase flips it to offline if the connection drops.
function claim(code, seat) {
  stopPresence?.();
  current = { code, seat };
  const onlineRef = roomRef(code, `players/${seat}/online`);
  stopPresence = onValue(ref(db, ".info/connected"), (snap) => {
    if (snap.val() !== true) return;
    onDisconnect(onlineRef)
      .set(false)
      .then(() => set(onlineRef, true))
      .catch((error) => console.warn("Data Slate: presence failed", error));
  });
  return { ...current };
}

export async function leaveRoom() {
  if (!current) return;
  const { code, seat } = current;
  stopPresence?.();
  stopPresence = null;
  current = null;
  const onlineRef = roomRef(code, `players/${seat}/online`);
  try {
    await onDisconnect(onlineRef).cancel();
    await set(onlineRef, false);
  } catch (error) {
    console.warn("Data Slate: couldn't mark the seat offline", error);
  }
}

// ---------- Scoring ----------

const report = (what) => (error) => console.warn(`Data Slate: ${what} failed`, error);

// Writes some of this device's own CP / Primary / Secondary. Firebase applies it locally straight away
// and syncs when it can, so scoring keeps working through a patchy connection.
export function updateMine(values) {
  if (!current) return;
  const { code, seat } = current;
  update(roomRef(code, `players/${seat}`), values).catch(report("score update"));
}

// Either player can move the shared round. A transaction, so two taps at once both count.
export function stepRound(delta) {
  if (!current) return;
  runTransaction(roomRef(current.code, "round"), (round) =>
    Math.min(ROUND.max, Math.max(ROUND.min, (Number.isFinite(round) ? round : ROUND.min) + delta)),
  ).catch(report("round update"));
}

// ---------- Watching ----------

// Calls onChange({ exists, round, players, connected }) now and on every change. Returns a function that stops watching.
export function watchRoom(code, onChange) {
  let room; // undefined until the first read comes back, then null if there's no such room
  let connected = false;
  let everConnected = false;
  const emit = () => {
    if (room === undefined) return;
    onChange({
      exists: room !== null,
      round: room?.round ?? ROUND.min,
      players: room?.players ?? {},
      // The socket reports "not connected" while it first opens; only a drop after that counts as offline.
      connected: connected || !everConnected,
    });
  };
  const stopRoom = onValue(
    roomRef(code),
    (snap) => {
      room = snap.val();
      emit();
    },
    (error) => {
      console.warn("Data Slate: couldn't read the room", error);
      room = null;
      emit();
    },
  );
  const stopConnected = onValue(ref(db, ".info/connected"), (snap) => {
    connected = snap.val() === true;
    everConnected ||= connected;
    emit();
  });
  return () => {
    stopRoom();
    stopConnected();
  };
}
