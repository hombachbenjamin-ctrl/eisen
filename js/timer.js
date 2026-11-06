import { fmtClock } from './util.js';

const REST_SECONDS = 180;
const DONE_VISIBLE_MS = 6000;
const STORAGE_KEY = 'eisen-rest';

let endAt = null;
let total = REST_SECONDS;
let tick = null;
let hideDone = null;
let buttonWanted = false;
let listener = () => {};

const dock = () => document.getElementById('dock');

export const onRestTick = (handler) => {
  listener = handler;
};

function setState(state) {
  const el = dock();
  el.dataset.state = state;
  el.hidden = state === 'idle' && !buttonWanted;
}

export function initDock() {
  const el = dock();
  el.innerHTML = `
    <button class="dock-start" data-dock="start">
      <span>Pause starten</span><strong>${fmtClock(REST_SECONDS)}</strong>
    </button>
    <div class="dock-fill"></div>
    <div class="dock-read"><span class="dock-time" role="timer"></span><span class="dock-label"></span></div>
    <button class="dock-stop" data-dock="stop" aria-label="Pause beenden">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
    </button>`;
  el.addEventListener('click', (event) => {
    const action = event.target.closest('[data-dock]')?.dataset.dock;
    if (action === 'start') startRest();
    if (action === 'stop') stopRest();
  });

  // The end time is absolute, so a rest keeps counting while the app is closed.
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.endAt > Date.now()) {
      endAt = saved.endAt;
      run();
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !endAt) return;
    acquireWakeLock();
    update();
  });
  document.addEventListener('click', unlockAudio, { capture: true });
}

/** The button only belongs to the workout screen. A running rest stays visible everywhere. */
export function showRestButton(on) {
  buttonWanted = on;
  if (dock().dataset.state === 'idle' || !dock().dataset.state) setState('idle');
}

export function startRest(seconds = REST_SECONDS) {
  total = seconds;
  endAt = Date.now() + seconds * 1000;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ endAt }));
  } catch {
    // Only the resume-after-relaunch convenience is lost.
  }
  run();
}

function run() {
  clearTimeout(hideDone);
  clearInterval(tick);
  setState('run');
  dock().querySelector('.dock-label').textContent = 'Pause';
  acquireWakeLock();
  update();
  tick = setInterval(update, 250);
}

function update() {
  const left = (endAt - Date.now()) / 1000;
  if (left <= 0) return finish();
  const el = dock();
  el.querySelector('.dock-time').textContent = fmtClock(Math.ceil(left));
  el.querySelector('.dock-fill').style.transform = `scaleX(${Math.min(1, left / total)})`;
  listener(fmtClock(Math.ceil(left)));
}

function clear() {
  clearInterval(tick);
  clearTimeout(hideDone);
  endAt = null;
  localStorage.removeItem(STORAGE_KEY);
  listener('');
  releaseWakeLock();
}

function finish() {
  clear();
  const el = dock();
  setState('done');
  el.querySelector('.dock-time').textContent = '0:00';
  el.querySelector('.dock-label').textContent = 'Pause vorbei';
  ring();
  navigator.vibrate?.([200, 100, 200]);
  hideDone = setTimeout(stopRest, DONE_VISIBLE_MS);
}

export function stopRest() {
  clear();
  setState('idle');
}

// --- Sound ---

let audio = null;

function unlockAudio() {
  try {
    if (!audio) {
      // "ambient" mixes with music from other apps instead of pausing it.
      if (navigator.audioSession) navigator.audioSession.type = 'ambient';
      audio = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audio.state !== 'running') audio.resume();
  } catch {
    audio = null;
  }
}

function ring() {
  if (!audio) return;
  const start = audio.currentTime + 0.02;
  [0, 0.24, 0.48].forEach((delay, i) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const at = start + delay;
    oscillator.frequency.value = i === 2 ? 1320 : 990;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.5, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.22);
  });
}

// --- The screen stays on during a rest, otherwise the end signal could not play ---

let wakeLock = null;

async function acquireWakeLock() {
  if (wakeLock || !navigator.wakeLock || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  wakeLock?.release();
  wakeLock = null;
}
