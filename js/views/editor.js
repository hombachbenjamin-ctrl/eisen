import { goBack, rerender } from '../nav.js';
import {
  dayById,
  findOrCreateExercise,
  savePlan,
  state,
} from '../store.js';
import { confirmDialog, header, icons, stepper, toast } from '../ui.js';
import { WEEKDAYS, WEEKDAYS_SHORT, esc, fmtReps, uid } from '../util.js';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function viewPlanDay(root, { id }) {
  const day = dayById(id);
  if (!day) {
    location.hash = '#/';
    return {};
  }

  function itemRow(item, index) {
    const exercise = state.exercises[item.exId];
    return `
      <div class="plan-row" data-item="${item.id}">
        <a class="plan-main" href="#/plan/${day.id}/${item.id}">
          <strong>${esc(exercise.name)}</strong>
          <small>${item.sets} × ${fmtReps(item.repMin, item.repMax)}</small>
        </a>
        <button class="icon-btn" data-act="move" data-dir="-1" aria-label="${esc(exercise.name)} nach oben" ${index === 0 ? 'disabled' : ''}>${icons.up}</button>
        <button class="icon-btn" data-act="move" data-dir="1" aria-label="${esc(exercise.name)} nach unten" ${index === day.items.length - 1 ? 'disabled' : ''}>${icons.down}</button>
      </div>`;
  }

  function renderList() {
    root.querySelector('.plan-list').innerHTML = day.items.map(itemRow).join('')
      || '<p class="page-note">Noch keine Übungen an diesem Tag.</p>';
  }

  root.innerHTML = `
    <div class="page-sub" data-color="${day.color}">
      ${header({ title: 'Plan ändern', back: `#/tag/${day.id}` })}
      <div class="page">
        <label class="field">
          <span>Name des Trainings</span>
          <input class="text-input" value="${esc(day.title)}" data-title autocomplete="off" enterkeyhint="done">
        </label>
        <div class="field">
          <span>Wochentag</span>
          <div class="segments segments-week">
            ${WEEK_ORDER.map((weekday) => `
              <button data-act="weekday" data-weekday="${weekday}" aria-pressed="${weekday === day.weekday}" aria-label="${WEEKDAYS[weekday]}">${WEEKDAYS_SHORT[weekday]}</button>`).join('')}
          </div>
        </div>
        <h2 class="section-title">Übungen</h2>
        <div class="plan-list"></div>
        <a class="btn btn-solid btn-wide" href="#/plan/${day.id}/neu">Übung hinzufügen</a>
      </div>
    </div>`;
  renderList();

  root.querySelector('[data-title]').addEventListener('change', (event) => {
    const title = event.target.value.trim();
    if (!title) {
      event.target.value = day.title;
      return;
    }
    day.title = title;
    savePlan();
  });

  return {
    actions: {
      weekday(el) {
        day.weekday = Number(el.dataset.weekday);
        savePlan();
        root.querySelectorAll('[data-act=weekday]').forEach((button) => {
          button.setAttribute('aria-pressed', String(button === el));
        });
      },
      move(el) {
        const index = day.items.findIndex((item) => item.id === el.closest('.plan-row').dataset.item);
        const target = index + Number(el.dataset.dir);
        const [item] = day.items.splice(index, 1);
        day.items.splice(target, 0, item);
        savePlan();
        renderList();
      },
    },
  };
}

export function viewPlanItem(root, { id, itemId }) {
  const day = dayById(id);
  const isNew = itemId === 'neu';
  const item = day?.items.find((entry) => entry.id === itemId);
  if (!day || (!isNew && !item)) {
    location.hash = day ? `#/plan/${day.id}` : '#/';
    return {};
  }

  const source = item ? state.exercises[item.exId] : null;
  const draft = {
    name: source?.name ?? '',
    sets: item?.sets ?? 3,
    repMin: item?.repMin ?? 10,
    repMax: item?.repMax ?? 15,
  };
  const back = `#/plan/${day.id}`;
  function suggestions(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return Object.values(state.exercises)
      .filter((ex) => ex.name.toLowerCase().includes(q) && ex.name.toLowerCase() !== q)
      .slice(0, 4);
  }

  function renderSuggestions(query) {
    root.querySelector('.suggest').innerHTML = suggestions(query)
      .map((ex) => `<button class="suggest-item" data-act="pick" data-name="${esc(ex.name)}">${esc(ex.name)}</button>`)
      .join('');
  }

  root.innerHTML = `
    <div class="page-sub" data-color="${day.color}">
      ${header({ title: isNew ? 'Übung hinzufügen' : 'Übung ändern', back })}
      <div class="page">
        <label class="field">
          <span>Name</span>
          <input class="text-input" value="${esc(draft.name)}" data-name autocomplete="off" autocorrect="off" enterkeyhint="done" placeholder="Zum Beispiel Kabelrudern">
        </label>
        <div class="suggest"></div>

        <div class="field-row">
          <div><strong>Sätze</strong></div>
          ${stepper({ name: 'sets', value: draft.sets, label: 'Sätze' })}
        </div>
        <div class="field-row">
          <div><strong>Wiederholungen von</strong></div>
          ${stepper({ name: 'repMin', value: draft.repMin, label: 'Wiederholungen von' })}
        </div>
        <div class="field-row">
          <div><strong>Wiederholungen bis</strong></div>
          ${stepper({ name: 'repMax', value: draft.repMax, label: 'Wiederholungen bis' })}
        </div>

        <button class="btn btn-solid btn-wide" data-act="save">${isNew ? 'Übung hinzufügen' : 'Änderungen speichern'}</button>
        ${isNew ? '' : '<button class="btn btn-quiet btn-wide btn-warn" data-act="remove">Übung aus diesem Tag entfernen</button>'}
        <p class="page-note">${isNew ? 'Gibst du den Namen einer vorhandenen Übung ein, läuft ihr Verlauf weiter.' : 'Der Name gilt für diese Übung an allen Tagen. Sätze und Wiederholungen nur an diesem Tag.'}</p>
      </div>
    </div>`;

  const nameInput = root.querySelector('[data-name]');
  nameInput.addEventListener('input', () => {
    draft.name = nameInput.value;
    renderSuggestions(nameInput.value);
  });

  function refreshStepper(name, text) {
    root.querySelector(`[data-stepper="${name}"] .step-value`).textContent = text;
  }

  return {
    actions: {
      pick(el) {
        draft.name = el.dataset.name;
        nameInput.value = draft.name;
        root.querySelector('.suggest').innerHTML = '';
      },
      step(el) {
        const { name } = el.dataset;
        const dir = Number(el.dataset.dir);
        const min = name === 'sets' ? 1 : name === 'repMax' ? draft.repMin : 1;
        const max = name === 'repMin' ? draft.repMax : name === 'sets' ? 12 : 100;
        draft[name] = Math.min(max, Math.max(min, draft[name] + dir));
        refreshStepper(name, String(draft[name]));
      },
      save() {
        const name = draft.name.trim();
        if (!name) {
          toast('Gib der Übung einen Namen.');
          nameInput.focus();
          return;
        }
        const nameTaken = Object.values(state.exercises).some(
          (ex) => ex.name.toLowerCase() === name.toLowerCase() && ex.id !== source?.id,
        );
        let exercise = source;
        if (!exercise || nameTaken) exercise = findOrCreateExercise(name);
        else exercise.name = name;

        const values = { exId: exercise.id, sets: draft.sets, repMin: draft.repMin, repMax: draft.repMax };
        if (item) Object.assign(item, values);
        else day.items.push({ id: uid('i'), ...values });
        savePlan();
        goBack(back);
      },
      async remove() {
        const yes = await confirmDialog({
          title: 'Übung entfernen?',
          text: `${source.name} verschwindet aus diesem Tag. Der Verlauf bleibt erhalten.`,
          confirmLabel: 'Übung entfernen',
          danger: true,
        });
        if (!yes) return;
        const index = day.items.indexOf(item);
        day.items.splice(index, 1);
        savePlan();
        goBack(back);
        toast(`${source.name} entfernt`, { action: 'Rückgängig', onAction: () => {
          day.items.splice(index, 0, item);
          savePlan();
          rerender();
        } });
      },
    },
  };
}
