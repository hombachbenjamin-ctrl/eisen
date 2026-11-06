import { goBack, track } from './nav.js';
import { initPad } from './pad.js';
import { load, setSaveErrorHandler } from './store.js';
import { initDock } from './timer.js';
import { toast } from './ui.js';
import { viewDay } from './views/day.js';
import { viewPlanDay, viewPlanItem } from './views/editor.js';
import { viewExercise, viewHistory, viewSession } from './views/history.js';
import { viewHome } from './views/home.js';
import { viewSettings } from './views/settings.js';

const routes = [
  { path: /^\/$/, view: viewHome, tab: 'training' },
  { path: /^\/verlauf$/, view: viewHistory, tab: 'verlauf' },
  { path: /^\/mehr$/, view: viewSettings, tab: 'mehr' },
  { path: /^\/tag\/([^/]+)$/, view: viewDay, keys: ['id'] },
  { path: /^\/plan\/([^/]+)$/, view: viewPlanDay, keys: ['id'] },
  { path: /^\/plan\/([^/]+)\/([^/]+)$/, view: viewPlanItem, keys: ['id', 'itemId'] },
  { path: /^\/verlauf\/uebung\/([^/]+)$/, view: viewExercise, keys: ['id'] },
  { path: /^\/verlauf\/training\/([^/]+)$/, view: viewSession, keys: ['id'] },
];

const screen = document.getElementById('screen');
const tabs = document.getElementById('tabs');
const scrollMemory = new Map();

let current = {};
let currentPath = null;

function route() {
  const path = location.hash.slice(1) || '/';
  const match = routes.find((r) => r.path.test(path)) ?? routes[0];
  const values = path.match(match.path)?.slice(1) ?? [];
  const params = Object.fromEntries((match.keys ?? []).map((key, i) => [key, values[i]]));

  if (currentPath) scrollMemory.set(currentPath, screen.scrollTop);
  const direction = track(path);
  current.destroy?.();

  tabs.hidden = !match.tab;
  tabs.querySelectorAll('a').forEach((link) => {
    if (link.dataset.tab === match.tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  const pushed = direction === 'forward' && !match.tab;
  screen.dataset.nav = pushed ? 'push' : direction === 'back' ? 'pop' : '';
  screen.scrollTop = 0;
  current = match.view(screen, params) ?? {};
  if (direction !== 'forward') screen.scrollTop = scrollMemory.get(path) ?? 0;
  // Restart the entrance animation for the new screen.
  screen.style.animation = 'none';
  void screen.offsetWidth;
  screen.style.animation = '';
  currentPath = path;
}

document.addEventListener('click', (event) => {
  const back = event.target.closest('.nav-btn');
  if (back) {
    event.preventDefault();
    goBack(back.getAttribute('href'));
    return;
  }
  const el = event.target.closest('[data-act]');
  if (el) current.actions?.[el.dataset.act]?.(el, event);
});

// iOS Safari only applies :active styles once a touch listener exists.
document.addEventListener('touchstart', () => {}, { passive: true });

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Entries are saved instantly, so a new version can take over on its own. The first install needs no reload.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((registration) => {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    });
  }).catch(() => {});
}

async function start() {
  setSaveErrorHandler(() => toast('Speichern fehlgeschlagen. Prüfe den freien Speicher auf deinem Handy.'));
  try {
    await load();
  } catch {
    toast('Gespeicherte Daten konnten nicht geladen werden. Starte die App neu.', { duration: 8000 });
  }
  initDock();
  initPad();
  window.addEventListener('hashchange', route);
  route();
  registerServiceWorker();
}

start();
