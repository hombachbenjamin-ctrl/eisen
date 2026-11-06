import {
  dayById,
  dayForWeekday,
  daysInWeekOrder,
  doneCount,
  loggedToday,
  nextTraining,
  plannedSets,
  saveMeta,
  sessionFor,
  state,
} from '../store.js';
import { icons, plateSvg } from '../ui.js';
import { WEEKDAYS, esc, fmtLong, fmtRelative, isoDate, plural } from '../util.js';

let hasRolledIn = false;

const isInstalled = () =>
  window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

function hero(day) {
  const session = sessionFor(day.id);
  const total = plannedSets(day);
  const done = session ? doneCount(session) : 0;
  const started = done > 0;
  return `
    <a class="hero-plate" href="#/tag/${day.id}" data-color="${day.color}"
       aria-label="${started ? 'Training fortsetzen' : 'Training starten'}: ${esc(day.title)}">
      ${plateSvg({
        top: started ? `${done} von ${total} Sätzen` : plural(total, 'Satz', 'Sätze'),
        bottom: plural(day.items.length, 'Übung', 'Übungen'),
        hub: done >= total ? 'Fertig' : started ? 'Weiter' : 'Start',
      })}
    </a>`;
}

function restHero(next) {
  return `
    <div class="hero-plate is-rest">
      ${plateSvg({ top: 'Kein Training', bottom: 'Erholung', hub: 'Frei' })}
    </div>
    ${next ? `<p class="hero-next">Nächstes Training: ${WEEKDAYS[next.date.getDay()]}, ${esc(next.day.title)}</p>` : ''}`;
}

function lastTrained(dayId) {
  const session = state.sessions.findLast((s) => s.dayId === dayId && doneCount(s) > 0);
  if (!session) return 'Noch nicht trainiert';
  return session.date === isoDate() ? 'Heute trainiert' : `Zuletzt ${fmtRelative(session.date)}`;
}

function dayRow(day, heroId) {
  return `
    <a class="day-row" href="#/tag/${day.id}" data-color="${day.color}">
      <span class="day-edge"></span>
      <span class="day-text">
        <small>${WEEKDAYS[day.weekday]}${day.id === heroId ? ', heute' : ''}</small>
        <strong>${esc(day.title)}</strong>
        <small>${lastTrained(day.id)}</small>
      </span>
      ${icons.chevron}
    </a>`;
}

export function viewHome(root) {
  const now = new Date();
  // Whatever was logged today wins, so a Tuesday workout done on Wednesday reopens where it stopped.
  const logged = loggedToday();
  const day = logged ? dayById(logged.dayId) : dayForWeekday(now.getDay());
  const roll = !hasRolledIn;
  hasRolledIn = true;

  const hint = !isInstalled() && !state.meta.installHintClosed
    ? `<aside class="install-hint">
        <p><strong>Auf den Home-Bildschirm legen:</strong> In Safari auf Teilen tippen, dann „Zum Home-Bildschirm“. Trag deine Sätze erst dort ein, denn Safari und die App speichern getrennt.</p>
        <button class="btn btn-quiet" data-act="closeHint">Verstanden</button>
      </aside>`
    : '';

  root.innerHTML = `
    <div class="home ${roll ? 'is-rolling' : ''}">
      <header>
        <p class="home-date">${fmtLong(now)}</p>
        <h1 class="home-title">${day ? esc(day.title) : 'Ruhetag'}</h1>
      </header>
      ${day ? hero(day) : restHero(nextTraining(now))}
      ${hint}
      <section class="day-list" aria-label="Alle Trainingstage">
        <h2 class="section-title">Alle Trainingstage</h2>
        ${daysInWeekOrder().map((d) => dayRow(d, day?.id)).join('')}
      </section>
    </div>`;

  return {
    actions: {
      closeHint(el) {
        state.meta.installHintClosed = true;
        saveMeta();
        el.closest('.install-hint').remove();
      },
    },
  };
}
