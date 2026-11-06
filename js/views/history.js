import { renderChart } from '../chart.js';
import { goBack } from '../nav.js';
import { closePad, openPad } from '../pad.js';
import {
  dayById,
  doneCount,
  doneSets,
  exerciseHistory,
  removeSession,
  restoreSession,
  saveSession,
  sessionStats,
  state,
  trainedExercises,
} from '../store.js';
import { confirmDialog, header, icons, toast } from '../ui.js';
import { esc, fmtDateYear, fmtNum, fmtSet, fmtShort, parseIso, plural } from '../util.js';

const CHART_COLORS = { red: '#e5383b', blue: '#3b82f6', yellow: '#b98d00', green: '#14905a' };

const METRICS = {
  kg: {
    label: 'Gewicht',
    unit: 'kg',
    value: (sets) => Math.max(...sets.map((s) => s.kg || 0)),
  },
  reps: {
    label: 'Wiederholungen',
    unit: 'Wdh.',
    value: (sets) => Math.max(...sets.map((s) => s.reps)),
  },
  volume: {
    label: 'Volumen',
    unit: 'kg',
    value: (sets) => sets.reduce((sum, s) => sum + (s.kg || 0) * s.reps, 0),
  },
};

let tab = 'uebungen';

function sparkline(entries) {
  // Only the latest training day, so the heavy and volume days don't zigzag against each other.
  const { dayId } = entries.at(-1).session;
  const sameDay = entries.filter((entry) => entry.session.dayId === dayId);
  const values = sameDay.slice(-12).map(({ sets }) => {
    const top = METRICS.kg.value(sets);
    return top || METRICS.reps.value(sets);
  });
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * 60 + 2).toFixed(1)},${(22 - ((v - min) / span) * 18).toFixed(1)}`)
    .join(' ');
  return `<svg class="spark" viewBox="0 0 64 26" width="64" height="26" aria-hidden="true"><polyline points="${points}"/></svg>`;
}

function exerciseRow({ exId, exercise }) {
  const entries = exerciseHistory(exId);
  const last = entries.at(-1);
  const top = [...last.sets].sort((a, b) => (b.kg || 0) - (a.kg || 0) || b.reps - a.reps)[0];
  return `
    <a class="list-row" href="#/verlauf/uebung/${exId}">
      <span class="list-text">
        <strong>${esc(exercise.name)}</strong>
        <small>${fmtSet(top)}, ${fmtShort(last.session.date)}</small>
      </span>
      ${sparkline(entries)}
      ${icons.chevron}
    </a>`;
}

function sessionRow(session) {
  const day = dayById(session.dayId);
  const stats = sessionStats(session);
  return `
    <a class="list-row" href="#/verlauf/training/${session.id}" data-color="${day?.color ?? ''}">
      <span class="day-edge"></span>
      <span class="list-text">
        <strong>${esc(session.dayTitle)}</strong>
        <small>${fmtShort(session.date)}, ${plural(stats.sets, 'Satz', 'Sätze')}, ${fmtNum(Math.round(stats.volume))} kg</small>
      </span>
      ${icons.chevron}
    </a>`;
}

export function viewHistory(root) {
  function render() {
    const exercises = trainedExercises();
    const sessions = state.sessions.filter((s) => doneCount(s) > 0).reverse();
    const empty = `
      <div class="empty">
        <p>Noch keine Sätze gespeichert. Sobald du im Training einen Satz abhakst, erscheint er hier.</p>
        <a class="btn btn-solid" href="#/">Zum Training</a>
      </div>`;
    root.innerHTML = `
      <div class="page">
        <h1 class="page-title">Verlauf</h1>
        <div class="segments" role="tablist">
          <button role="tab" aria-selected="${tab === 'uebungen'}" data-act="tab" data-tab="uebungen">Übungen</button>
          <button role="tab" aria-selected="${tab === 'trainings'}" data-act="tab" data-tab="trainings">Trainings</button>
        </div>
        ${exercises.length === 0 ? empty : `
          <div class="list">
            ${tab === 'uebungen' ? exercises.map(exerciseRow).join('') : sessions.map(sessionRow).join('')}
          </div>`}
      </div>`;
  }
  render();
  return {
    actions: {
      tab(el) {
        tab = el.dataset.tab;
        render();
      },
    },
  };
}

export function viewExercise(root, { id }) {
  const exercise = state.exercises[id];
  const entries = exerciseHistory(id);
  if (!exercise || !entries.length) {
    root.innerHTML = `
      ${header({ title: exercise?.name ?? 'Übung', back: '#/verlauf' })}
      <div class="empty"><p>Für diese Übung gibt es noch keine Sätze. Hak im Training einen Satz ab, dann startet hier der Verlauf.</p></div>`;
    return {};
  }

  const hasWeight = entries.some(({ sets }) => sets.some((s) => s.kg > 0));
  let metric = hasWeight ? 'kg' : 'reps';
  const metrics = hasWeight ? ['kg', 'reps', 'volume'] : ['reps'];

  const allSets = entries.flatMap((entry) => entry.sets);
  const bestKg = Math.max(...allSets.map((s) => s.kg || 0));
  const bestReps = Math.max(...allSets.map((s) => s.reps));
  const best = hasWeight
    ? { label: 'Bestes Gewicht', value: `${fmtNum(bestKg)} kg` }
    : { label: 'Beste Wiederholungen', value: `${bestReps}` };

  function chartData() {
    const { value } = METRICS[metric];
    const groups = new Map();
    entries.forEach(({ session, sets }) => {
      if (!groups.has(session.dayId)) groups.set(session.dayId, []);
      groups.get(session.dayId).push({
        x: parseIso(session.date).getTime(),
        y: value(sets),
        value: fmtNum(Math.round(value(sets) * 100) / 100),
        note: fmtShort(session.date),
      });
    });
    return [...groups.entries()].map(([dayId, points]) => {
      const day = dayById(dayId);
      return {
        id: dayId,
        label: day?.title ?? 'Früherer Tag',
        color: CHART_COLORS[day?.color] ?? '#a3adbb',
        points,
      };
    });
  }

  function drawChart() {
    const el = root.querySelector('.chart');
    if (entries.length < 2) {
      el.innerHTML = '<p class="chart-note">Nach dem zweiten Training siehst du hier deine Kurve.</p>';
      return;
    }
    renderChart(el, { series: chartData(), unit: METRICS[metric].unit });
  }

  root.innerHTML = `
    <div class="page-sub">
      ${header({ title: exercise.name, back: '#/verlauf' })}
      <div class="page">
        <dl class="stats">
          <div><dt>${best.label}</dt><dd>${best.value}</dd></div>
          <div><dt>Trainings</dt><dd>${entries.length}</dd></div>
        </dl>
        ${metrics.length > 1 ? `
          <div class="segments" role="tablist" aria-label="Wert im Diagramm">
            ${metrics.map((key) => `<button role="tab" aria-selected="${key === metric}" data-act="metric" data-metric="${key}">${METRICS[key].label}</button>`).join('')}
          </div>` : ''}
        <div class="chart"></div>
        <h2 class="section-title">Alle Trainings</h2>
        <div class="log">
          ${[...entries].reverse().map(({ session, sets }) => `
            <a class="log-row" href="#/verlauf/training/${session.id}">
              <span class="log-date">${fmtDateYear(session.date)}</span>
              <span class="log-sets">${sets.map(fmtSet).join(', ')}</span>
            </a>`).join('')}
        </div>
      </div>
    </div>`;
  drawChart();

  return {
    actions: {
      metric(el) {
        metric = el.dataset.metric;
        root.querySelectorAll('[data-act=metric]').forEach((button) => {
          button.setAttribute('aria-selected', String(button === el));
        });
        drawChart();
      },
    },
  };
}

export function viewSession(root, { id }) {
  const session = state.sessions.find((s) => s.id === id);
  if (!session) {
    location.hash = '#/verlauf';
    return {};
  }

  function render() {
    const stats = sessionStats(session);
    const exIds = Object.keys(session.log).filter((exId) => doneSets(session, exId).length);
    root.innerHTML = `
      <div class="page-sub">
        ${header({ title: session.dayTitle, back: '#/verlauf' })}
        <div class="page">
          <p class="page-note">${fmtDateYear(session.date)}</p>
          <dl class="stats">
            <div><dt>Sätze</dt><dd>${stats.sets}</dd></div>
            <div><dt>Bewegt</dt><dd>${fmtNum(Math.round(stats.volume))} kg</dd></div>
          </dl>
          ${exIds.map((exId) => `
            <section class="past-ex">
              <h2>${esc(state.exercises[exId]?.name ?? exId)}</h2>
              ${session.log[exId].map((set, index) => set?.done ? `
                <button class="past-set" data-act="editSet" data-ex="${esc(exId)}" data-i="${index}">
                  <span>Satz ${index + 1}</span><strong>${fmtSet(set)}</strong>
                </button>` : '').join('')}
            </section>`).join('')}
          <button class="btn btn-quiet btn-wide btn-warn" data-act="remove">Training löschen</button>
        </div>
      </div>`;
  }
  render();

  return {
    actions: {
      editSet(el) {
        const { ex: exId, i } = el.dataset;
        const set = session.log[exId][Number(i)];
        openPad({
          title: `${state.exercises[exId]?.name ?? exId}, Satz ${Number(i) + 1}`,
          kg: set.kg,
          reps: set.reps,
          onChange({ kg, reps }) {
            set.kg = kg;
            if (reps != null) set.reps = reps;
            saveSession(session);
          },
          onClose: render,
        });
      },
      async remove() {
        const yes = await confirmDialog({
          title: 'Training löschen?',
          text: `${session.dayTitle} vom ${fmtDateYear(session.date)} verschwindet aus dem Verlauf.`,
          confirmLabel: 'Training löschen',
          danger: true,
        });
        if (!yes) return;
        await removeSession(session.id);
        goBack('#/verlauf');
        toast('Training gelöscht', { action: 'Rückgängig', onAction: () => {
          restoreSession(session);
          location.hash = `#/verlauf/training/${session.id}`;
        } });
      },
    },
    destroy: closePad,
  };
}
