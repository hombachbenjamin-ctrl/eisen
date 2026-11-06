import { onRestTick } from './timer.js';
import { fmtNum } from './util.js';

const MAX_KG = 999.99;
const MAX_REPS = 999;
const KG_STEP = 2.5;

let session = null;

const padEl = () => document.getElementById('pad');

const toText = (value) => (value == null ? '' : fmtNum(value).replace(/\./g, ''));
const toNumber = (text) => {
  if (text === '' || text === ',') return null;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export function initPad() {
  const el = padEl();
  el.innerHTML = `
    <div class="pad-head">
      <span class="pad-title"></span>
      <span class="pad-rest"></span>
      <button class="pad-close" data-pad="close">Schließen</button>
    </div>
    <div class="pad-fields">
      <button class="pad-field" data-pad="field" data-field="kg"><strong></strong><small>kg</small></button>
      <button class="pad-field" data-pad="field" data-field="reps"><strong></strong><small>Wdh.</small></button>
    </div>
    <div class="pad-keys">
      ${['1', '2', '3'].map(key).join('')}
      <button class="pad-key pad-step" data-pad="step" data-dir="1"></button>
      ${['4', '5', '6'].map(key).join('')}
      <button class="pad-key pad-step" data-pad="step" data-dir="-1"></button>
      ${['7', '8', '9'].map(key).join('')}
      <button class="pad-key pad-side" data-pad="back" aria-label="Letzte Ziffer löschen">
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7zM12 9.5l5 5M17 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>
      </button>
      <button class="pad-key" data-pad="digit" data-key="," data-comma>,</button>
      ${key('0')}
      <button class="pad-key pad-clear" data-pad="clear">Leer</button>
      <button class="pad-key pad-next" data-pad="next"></button>
    </div>`;
  el.addEventListener('click', onPadClick);
  document.addEventListener('keydown', onKeydown);
  document.getElementById('pad-scrim').addEventListener('click', closePad);
}

function key(digit) {
  return `<button class="pad-key" data-pad="digit" data-key="${digit}">${digit}</button>`;
}

export function openPad(options) {
  if (session) finishSession();
  session = {
    ...options,
    field: options.field ?? 'kg',
    kg: toText(options.kg),
    reps: toText(options.reps),
    fresh: true,
  };
  const el = padEl();
  el.querySelector('.pad-title').textContent = options.title;
  el.hidden = false;
  document.getElementById('pad-scrim').hidden = false;
  document.body.classList.add('pad-open');
  onRestTick((time) => {
    el.querySelector('.pad-rest').textContent = time ? `Pause ${time}` : '';
  });
  render();
  requestAnimationFrame(() => el.classList.add('is-up'));
  return el;
}

export function closePad() {
  if (!session) return;
  finishSession();
  const el = padEl();
  el.classList.remove('is-up');
  document.body.classList.remove('pad-open');
  document.getElementById('pad-scrim').hidden = true;
  onRestTick(() => {});
  el.querySelector('.pad-rest').textContent = '';
  setTimeout(() => {
    if (!session) el.hidden = true;
  }, 260);
}

function finishSession() {
  const { onClose } = session;
  session = null;
  onClose?.();
}

function render() {
  const el = padEl();
  const { field } = session;
  el.querySelectorAll('.pad-field').forEach((button) => {
    const name = button.dataset.field;
    const value = session[name];
    const hint = name === 'kg' ? session.hintKg : session.hintReps;
    const strong = button.querySelector('strong');
    strong.textContent = value || (hint != null ? fmtNum(hint) : '–');
    button.classList.toggle('is-hint', !value);
    button.classList.toggle('is-active', name === field);
    button.setAttribute('aria-pressed', String(name === field));
  });
  const [up, down] = el.querySelectorAll('.pad-step');
  const stepLabel = field === 'kg' ? fmtNum(KG_STEP) : '1';
  up.textContent = `+${stepLabel}`;
  down.textContent = `−${stepLabel}`;
  el.querySelector('[data-comma]').disabled = field !== 'kg';
  el.querySelector('.pad-next').textContent = field === 'kg' ? 'Weiter' : 'Fertig';
}

function emit() {
  session.onChange?.({ kg: toNumber(session.kg), reps: toNumber(session.reps) });
  render();
}

function typeDigit(char) {
  const { field } = session;
  let text = session.fresh ? '' : session[field];
  session.fresh = false;
  if (char === ',') {
    if (field !== 'kg' || text.includes(',')) return;
    text = text || '0';
  }
  const next = text === '0' && char !== ',' ? char : text + char;
  const decimals = next.split(',')[1];
  const limit = field === 'kg' ? MAX_KG : MAX_REPS;
  if (decimals?.length > 2 || toNumber(next) > limit) return;
  session[field] = next;
  emit();
}

function step(direction) {
  const { field } = session;
  const hint = field === 'kg' ? session.hintKg : session.hintReps;
  const base = toNumber(session[field]) ?? hint ?? 0;
  const delta = field === 'kg' ? KG_STEP : 1;
  const limit = field === 'kg' ? MAX_KG : MAX_REPS;
  const next = Math.min(limit, Math.max(0, base + direction * delta));
  session[field] = toText(next);
  session.fresh = false;
  emit();
}

function adoptHint(field) {
  const hint = field === 'kg' ? session.hintKg : session.hintReps;
  if (session[field] === '' && hint != null) {
    session[field] = toText(hint);
    emit();
  }
}

function next() {
  adoptHint(session.field);
  if (session.field === 'kg') {
    session.field = 'reps';
    session.fresh = true;
    render();
    return;
  }
  // Reps typed straight into their field keep last time's weight.
  adoptHint('kg');
  const { onDone } = session;
  closePad();
  onDone?.();
}

function onPadClick(event) {
  const button = event.target.closest('[data-pad]');
  if (!button || !session) return;
  const action = button.dataset.pad;
  if (action === 'digit') typeDigit(button.dataset.key);
  if (action === 'step') step(Number(button.dataset.dir));
  if (action === 'next') next();
  if (action === 'close') closePad();
  if (action === 'back') {
    session[session.field] = session.fresh ? '' : session[session.field].slice(0, -1);
    session.fresh = false;
    emit();
  }
  if (action === 'clear') {
    session[session.field] = '';
    session[session.field === 'kg' ? 'hintKg' : 'hintReps'] = null;
    session.fresh = false;
    emit();
  }
  if (action === 'field') {
    session.field = button.dataset.field;
    session.fresh = true;
    render();
  }
}

function onKeydown(event) {
  if (!session) return;
  if (/^[0-9]$/.test(event.key)) typeDigit(event.key);
  else if (event.key === ',' || event.key === '.') typeDigit(',');
  else if (event.key === 'Backspace') {
    session[session.field] = session[session.field].slice(0, -1);
    session.fresh = false;
    emit();
  } else if (event.key === 'Enter') next();
  else if (event.key === 'Escape') closePad();
  else return;
  event.preventDefault();
}
