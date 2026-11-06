import { esc } from './util.js';

export const icons = {
  back: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  up: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M5 15l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export function header({ title, back, right = '' }) {
  return `
    <header class="bar-top">
      <a class="nav-btn" href="${back}" aria-label="Zurück">${icons.back}</a>
      <h1 class="bar-title">${esc(title)}</h1>
      <div class="bar-right">${right}</div>
    </header>`;
}

export function stepper({ name, value, label, text }) {
  return `
    <div class="stepper" data-stepper="${name}">
      <button class="step-btn" data-act="step" data-name="${name}" data-dir="-1" aria-label="${esc(label)} verringern">−</button>
      <output class="step-value">${esc(text ?? value)}</output>
      <button class="step-btn" data-act="step" data-name="${name}" data-dir="1" aria-label="${esc(label)} erhöhen">+</button>
    </div>`;
}

// --- Toast ---

let toastTimer = null;

export function toast(text, { action, onAction, duration = 4000 } = {}) {
  const el = document.getElementById('toast');
  clearTimeout(toastTimer);
  el.innerHTML = `<span>${esc(text)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
  el.hidden = false;
  el.classList.add('is-up');
  if (action) {
    el.querySelector('button').onclick = () => {
      hideToast();
      onAction();
    };
  }
  toastTimer = setTimeout(hideToast, duration);
}

function hideToast() {
  document.getElementById('toast').classList.remove('is-up');
}

// --- Confirm ---

export function confirmDialog({ title, text, confirmLabel, danger = false }) {
  const dialog = document.getElementById('dialog');
  dialog.innerHTML = `
    <h2>${esc(title)}</h2>
    <p>${esc(text)}</p>
    <div class="dialog-actions">
      <button class="btn btn-quiet" value="no">Abbrechen</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-solid'}" value="yes">${esc(confirmLabel)}</button>
    </div>`;
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.onclick = (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      dialog.close();
      resolve(button.value === 'yes');
    };
    dialog.oncancel = () => resolve(false);
  });
}

// --- Bumper plate, seen from the front ---

export function plateSvg({ top, bottom, hub }) {
  return `
    <svg class="plate-svg" viewBox="0 0 400 400" aria-hidden="true">
      <defs>
        <path id="arc-top" d="M 75 200 A 125 125 0 0 1 325 200"/>
        <path id="arc-bottom" d="M 43 200 A 157 157 0 0 0 357 200"/>
      </defs>
      <circle class="plate-rubber" cx="200" cy="200" r="198"/>
      <circle class="plate-groove" cx="200" cy="200" r="184"/>
      <circle class="plate-groove" cx="200" cy="200" r="108"/>
      <g class="plate-emboss">
        <text class="plate-light"><textPath href="#arc-top" startOffset="50%">${esc(top)}</textPath></text>
        <text class="plate-dark"><textPath href="#arc-top" startOffset="50%">${esc(top)}</textPath></text>
        <text class="plate-light"><textPath href="#arc-bottom" startOffset="50%">${esc(bottom)}</textPath></text>
        <text class="plate-dark"><textPath href="#arc-bottom" startOffset="50%">${esc(bottom)}</textPath></text>
      </g>
      <circle class="plate-collar" cx="200" cy="200" r="94"/>
      <circle class="plate-hub" cx="200" cy="200" r="84"/>
      <text class="plate-hub-text" x="200" y="200" dominant-baseline="central">${esc(hub)}</text>
    </svg>`;
}

// --- Barbell progress: one plate per entered set ---

const plateHeight = (slot, slots) => 100 - 46 * (slots > 1 ? slot / (slots - 1) : 0);

export function barbell(total) {
  const perSide = Math.max(1, Math.ceil(total / 2));
  const side = (name) =>
    `<span class="bb-side bb-${name}">${Array.from(
      { length: perSide },
      (_, slot) => `<i class="bb-plate" style="--h:${plateHeight(slot, perSide)}%"></i>`,
    ).join('')}</span>`;
  return `
    <div class="bb" style="--n:${perSide}" role="img">
      <span class="bb-rod"></span>
      ${side('left')}
      <span class="bb-grip"></span>
      ${side('right')}
    </div>`;
}

export function loadBarbell(el, done, total, animate = false) {
  const left = el.querySelectorAll('.bb-left .bb-plate');
  const right = el.querySelectorAll('.bb-right .bb-plate');
  for (let i = 0; i < total; i++) {
    const plate = (i % 2 ? right : left)[Math.floor(i / 2)];
    if (!plate) continue;
    const isOn = i < done;
    if (isOn && !plate.classList.contains('is-on') && animate) plate.classList.add('is-landing');
    plate.classList.toggle('is-on', isOn);
  }
  el.setAttribute('aria-label', `${done} von ${total} Sätzen eingetragen`);
}
