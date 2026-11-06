import { closePad, openPad } from '../pad.js';
import {
  dayById,
  doneCount,
  doneSets,
  ensureSession,
  lastLog,
  saveSession,
  sessionFor,
  setAt,
  state,
  suggestSet,
} from '../store.js';
import { showRestButton } from '../timer.js';
import { barbell, header, loadBarbell } from '../ui.js';
import { esc, fmtNum, fmtReps, fmtSet, fmtShort, plural } from '../util.js';

const ADVANCE_DELAY = 300;

export function viewDay(root, { id }) {
  const day = dayById(id);
  if (!day) {
    location.hash = '#/';
    return {};
  }
  document.body.dataset.color = day.color;
  showRestButton(true);

  let session = sessionFor(day.id);
  const previous = new Map();
  const rows = buildRows();
  let advanceTimer = null;

  // Entries beyond the plan stay visible today, rows left empty don't count.
  function filledSets(exId) {
    const log = session?.log[exId] ?? [];
    return log.reduce((last, set, i) => (set?.kg != null || set?.reps != null ? i + 1 : last), 0);
  }

  function buildRows() {
    const planned = day.items.map((item) => ({ ...item, exercise: state.exercises[item.exId] }));
    const known = new Set(day.items.map((item) => item.exId));
    // Sets logged before the exercise was removed from the plan stay visible today.
    const extras = Object.keys(session?.log ?? {})
      .filter((exId) => !known.has(exId) && state.exercises[exId] && filledSets(exId))
      .map((exId) => ({ exId, sets: filledSets(exId), exercise: state.exercises[exId] }));
    const all = [...planned, ...extras];
    all.forEach((row) => {
      previous.set(row.exId, lastLog(row.exId, day.id));
      row.sets = Math.max(row.sets, filledSets(row.exId));
    });
    return all;
  }

  const rowFor = (exId) => rows.find((row) => row.exId === exId);
  const totalSets = () => rows.reduce((sum, row) => sum + row.sets, 0);
  const doneTotal = () => (session ? doneCount(session) : 0);
  const doneFor = (exId) => (session ? doneSets(session, exId).length : 0);
  const isComplete = (row) => doneFor(row.exId) >= row.sets;
  let openId = rows.find((row) => !isComplete(row))?.exId ?? null;

  // --- Templates ---

  function cell(row, index, field) {
    const set = session?.log[row.exId]?.[index];
    const value = set?.[field];
    const bodyweight = field === 'kg' && set?.done && !value;
    const text = bodyweight ? '–' : value == null ? '' : fmtNum(value);
    return `<button class="cell" data-act="edit" data-field="${field}"
      aria-label="${field === 'kg' ? 'Gewicht' : 'Wiederholungen'}, Satz ${index + 1}: ${text || 'leer'}">${text}</button>`;
  }

  function setRow(row, index) {
    const prev = previous.get(row.exId)?.sets[index];
    return `
      <div class="set" data-i="${index}">
        <span class="set-n">${index + 1}</span>
        <span class="set-prev">${prev ? fmtSet(prev) : '–'}</span>
        ${cell(row, index, 'kg')}
        ${cell(row, index, 'reps')}
      </div>`;
  }

  function pips(row) {
    const done = doneFor(row.exId);
    return Array.from({ length: row.sets }, (_, i) => `<i class="${i < done ? 'is-on' : ''}"></i>`).join('');
  }

  function exerciseBlock(row) {
    const prev = previous.get(row.exId);
    const isOpen = row.exId === openId;
    return `
      <section class="ex" data-ex="${row.exId}" data-open="${isOpen}" data-complete="${isComplete(row)}">
        <button class="ex-head" data-act="openEx" aria-expanded="${isOpen}">
          <span class="ex-name">
            <strong>${esc(row.exercise.name)}</strong>
            <small>${row.repMin ? `${row.sets} × ${fmtReps(row.repMin, row.repMax)}` : `${row.sets} Sätze`}</small>
          </span>
          <span class="ex-pips" aria-label="${doneFor(row.exId)} von ${row.sets} Sätzen">${pips(row)}</span>
        </button>
        <div class="ex-fold"><div class="ex-body">
          <div class="sets">
            <div class="sets-head">
              <span>Satz</span><span>${prev ? fmtShort(prev.date) : 'Zuletzt'}</span><span>kg</span><span>Wdh.</span>
            </div>
            ${Array.from({ length: row.sets }, (_, i) => setRow(row, i)).join('')}
          </div>
          <div class="ex-foot">
            <button class="btn btn-quiet" data-act="addSet">Satz hinzufügen</button>
            <a class="btn btn-quiet" href="#/verlauf/uebung/${row.exId}">Verlauf</a>
          </div>
        </div></div>
      </section>`;
  }

  root.innerHTML = `
    <div class="workout" data-color="${day.color}">
      <div class="workout-top">
        ${header({ title: day.title, back: '#/', right: `<a class="nav-link" href="#/plan/${day.id}">Plan ändern</a>` })}
        <div class="workout-bar">
          ${barbell(totalSets())}
          <p class="workout-count"></p>
        </div>
      </div>
      ${day.items.length ? '' : '<p class="empty">Dieser Tag hat noch keine Übungen. Füge sie unter „Plan ändern“ hinzu.</p>'}
      <div class="ex-list">${rows.map(exerciseBlock).join('')}</div>
    </div>`;
  updateBar(false);

  // --- Targeted updates, so scroll position and the open pad survive ---

  const exEl = (exId) => root.querySelector(`.ex[data-ex="${CSS.escape(exId)}"]`);
  const setEl = (exId, index) => exEl(exId)?.querySelector(`.set[data-i="${index}"]`);

  function updateBar(animate) {
    const total = totalSets();
    const done = doneTotal();
    loadBarbell(root.querySelector('.bb'), done, total, animate);
    root.querySelector('.workout-count').textContent = `${done} von ${plural(total, 'Satz', 'Sätzen')}`;
  }

  function updateRow(exId, index) {
    const el = setEl(exId, index);
    const fresh = document.createElement('template');
    fresh.innerHTML = setRow(rowFor(exId), index).trim();
    const next = fresh.content.firstChild;
    next.classList.toggle('is-editing', el.classList.contains('is-editing'));
    el.replaceWith(next);
  }

  function updateHead(exId) {
    const row = rowFor(exId);
    const el = exEl(exId);
    el.querySelector('.ex-pips').innerHTML = pips(row);
    el.dataset.complete = String(isComplete(row));
  }

  function openExercise(exId, scroll = true) {
    openId = exId;
    root.querySelectorAll('.ex').forEach((el) => {
      const isOpen = el.dataset.ex === exId;
      el.dataset.open = String(isOpen);
      el.querySelector('.ex-head').setAttribute('aria-expanded', String(isOpen));
    });
    if (exId && scroll) setTimeout(() => exEl(exId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 280);
  }

  function openNextExercise(row) {
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(() => {
      const after = rows.slice(rows.indexOf(row) + 1);
      const next = after.find((r) => !isComplete(r)) ?? rows.find((r) => !isComplete(r));
      openExercise(next?.exId ?? null);
    }, ADVANCE_DELAY);
  }

  function editSet(exId, index, field) {
    const row = rowFor(exId);
    const wasComplete = isComplete(row);
    const hint = suggestSet(session, exId, index, previous.get(exId));
    const set = session?.log[exId]?.[index];
    const el = setEl(exId, index);
    el.classList.add('is-editing');
    const pad = openPad({
      title: `${row.exercise.name}, Satz ${index + 1}`,
      field,
      kg: set?.kg,
      reps: set?.reps,
      hintKg: hint?.kg,
      hintReps: hint?.reps,
      onChange({ kg, reps }) {
        session = ensureSession(day.id);
        // A set counts as soon as it has reps. Weight stays empty for bodyweight exercises.
        Object.assign(setAt(session, exId, index), { kg, reps, done: reps != null });
        saveSession(session);
        updateRow(exId, index);
        updateHead(exId);
        updateBar(true);
      },
      onDone() {
        if (!wasComplete && isComplete(row)) openNextExercise(row);
      },
      onClose() {
        setEl(exId, index)?.classList.remove('is-editing');
      },
    });
    // The row jumps while the pad slides in, so it is never left hidden behind the pad.
    const padTop = document.getElementById('app').getBoundingClientRect().bottom - pad.offsetHeight;
    const overlap = el.getBoundingClientRect().bottom + 16 - padTop;
    if (overlap > 0) document.getElementById('screen').scrollTop += overlap;
  }

  return {
    actions: {
      openEx(el) {
        const exId = el.closest('.ex').dataset.ex;
        openExercise(exId === openId ? null : exId, exId !== openId);
      },
      edit(el) {
        editSet(el.closest('.ex').dataset.ex, Number(el.closest('.set').dataset.i), el.dataset.field);
      },
      addSet(el) {
        const exId = el.closest('.ex').dataset.ex;
        const row = rowFor(exId);
        row.sets += 1;
        const wrap = document.createElement('template');
        wrap.innerHTML = setRow(row, row.sets - 1).trim();
        exEl(exId).querySelector('.sets').append(wrap.content.firstChild);
        session = ensureSession(day.id);
        setAt(session, exId, row.sets - 1);
        saveSession(session);
        updateHead(exId);
        root.querySelector('.bb').outerHTML = barbell(totalSets());
        updateBar(false);
      },
    },
    destroy() {
      clearTimeout(advanceTimer);
      closePad();
      showRestButton(false);
      delete document.body.dataset.color;
    },
  };
}
