import * as db from './db.js';
import { defaultPlan } from './plan.js';
import { isoDate, slug, uid } from './util.js';

export const state = {
  days: [],
  exercises: {},
  sessions: [],
  meta: { lastBackupAt: null, installHintClosed: false },
};

let onSaveError = () => {};
export const setSaveErrorHandler = (handler) => {
  onSaveError = handler;
};
const guard = (promise) => promise.catch((error) => onSaveError(error));

const byDate = (a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt;

export async function load() {
  const plan = defaultPlan();
  const [days, exercises, meta, sessions] = await Promise.all([
    db.kvGet('days'),
    db.kvGet('exercises'),
    db.kvGet('meta'),
    db.sessionsAll(),
  ]);
  state.days = days ?? plan.days;
  state.exercises = exercises ?? plan.exercises;
  Object.assign(state.meta, meta);
  state.sessions = sessions.sort(byDate);
  if (!days) savePlan();

  // One-time switch to 3 sets everywhere. Sets changed in the editor afterwards stay as they are.
  if (!state.meta.threeSets) {
    state.days.forEach((day) => day.items.forEach((item) => {
      item.sets = 3;
    }));
    state.meta.threeSets = true;
    savePlan();
    saveMeta();
  }

  // A session opened on an earlier day but never logged leaves nothing worth keeping.
  const today = isoDate();
  state.sessions
    .filter((s) => s.date < today && doneCount(s) === 0)
    .forEach((s) => removeSession(s.id));
}

export const savePlan = () =>
  guard(Promise.all([db.kvSet('days', state.days), db.kvSet('exercises', state.exercises)]));
export const saveMeta = () => guard(db.kvSet('meta', state.meta));
export const saveSession = (session) => guard(db.sessionPut(session));

// --- Plan queries ---

export const dayById = (id) => state.days.find((d) => d.id === id);
export const dayForWeekday = (weekday) => state.days.find((d) => d.weekday === weekday);
export const daysInWeekOrder = () =>
  [...state.days].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7));

export function nextTraining(from = new Date()) {
  for (let offset = 1; offset <= 7; offset++) {
    const date = new Date(from);
    date.setDate(date.getDate() + offset);
    const day = dayForWeekday(date.getDay());
    if (day) return { day, date };
  }
  return null;
}

export const plannedSets = (day) => day.items.reduce((sum, item) => sum + item.sets, 0);

// --- Session queries ---

export const sessionFor = (dayId, date = isoDate()) =>
  state.sessions.find((s) => s.dayId === dayId && s.date === date);

export const loggedToday = () => {
  const today = isoDate();
  return state.sessions.findLast((s) => s.date === today && doneCount(s) > 0);
};

export const doneSets = (session, exId) => (session.log[exId] ?? []).filter((s) => s?.done);

export const doneCount = (session) =>
  Object.keys(session.log).reduce((sum, exId) => sum + doneSets(session, exId).length, 0);

export function sessionStats(session) {
  const exIds = Object.keys(session.log).filter((exId) => doneSets(session, exId).length);
  const sets = exIds.flatMap((exId) => doneSets(session, exId));
  return {
    exercises: exIds.length,
    sets: sets.length,
    volume: sets.reduce((sum, s) => sum + (s.kg || 0) * s.reps, 0),
  };
}

// Prefers the same training day so the heavy day compares with the heavy day, not the volume day.
export function lastLog(exId, dayId, beforeDate = isoDate()) {
  let fallback = null;
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const session = state.sessions[i];
    if (session.date >= beforeDate) continue;
    const sets = doneSets(session, exId);
    if (!sets.length) continue;
    const entry = { date: session.date, dayId: session.dayId, sets };
    if (session.dayId === dayId) return entry;
    fallback ??= entry;
  }
  return fallback;
}

// If today's previous set moved away from last time, the rest of the sets shift by the same step.
export function suggestSet(session, exId, index, previous) {
  const before = index > 0 ? session?.log[exId]?.[index - 1] : null;
  const prevSet = previous?.sets[index] ?? previous?.sets.at(-1);
  const prevBefore = index > 0 ? previous?.sets[index - 1] : null;
  let kg = prevSet?.kg ?? null;
  if (before?.kg != null) {
    kg = prevSet && prevBefore ? prevSet.kg + (before.kg - prevBefore.kg) : before.kg;
  }
  const reps = prevSet?.reps ?? before?.reps ?? null;
  return kg == null && reps == null ? null : { kg, reps };
}

export function exerciseHistory(exId) {
  return state.sessions
    .map((session) => ({ session, sets: doneSets(session, exId) }))
    .filter((entry) => entry.sets.length);
}

export function trainedExercises() {
  const latest = new Map();
  state.sessions.forEach((session) => {
    Object.keys(session.log).forEach((exId) => {
      if (doneSets(session, exId).length) latest.set(exId, session.date);
    });
  });
  return [...latest.entries()]
    .map(([exId, date]) => ({ exId, date, exercise: state.exercises[exId] }))
    .filter((entry) => entry.exercise)
    .sort((a, b) => b.date.localeCompare(a.date) || a.exercise.name.localeCompare(b.exercise.name));
}

// --- Session changes ---

export function ensureSession(dayId) {
  let session = sessionFor(dayId);
  if (!session) {
    const day = dayById(dayId);
    session = {
      id: uid('s'),
      dayId,
      dayTitle: day.title,
      date: isoDate(),
      startedAt: Date.now(),
      log: {},
    };
    state.sessions.push(session);
    state.sessions.sort(byDate);
    navigator.storage?.persist?.().catch(() => {});
  }
  return session;
}

export function setAt(session, exId, index) {
  session.log[exId] ??= [];
  session.log[exId][index] ??= { kg: null, reps: null, done: false };
  return session.log[exId][index];
}

export function removeSession(id) {
  state.sessions = state.sessions.filter((s) => s.id !== id);
  return guard(db.sessionDelete(id));
}

export function restoreSession(session) {
  state.sessions.push(session);
  state.sessions.sort(byDate);
  saveSession(session);
}

// --- Plan changes ---

export function findOrCreateExercise(name) {
  const wanted = name.trim();
  const match = Object.values(state.exercises).find(
    (ex) => ex.name.toLowerCase() === wanted.toLowerCase(),
  );
  if (match) return match;
  let id = slug(wanted) || uid('ex');
  while (state.exercises[id]) id = `${id}-${Math.random().toString(36).slice(2, 5)}`;
  state.exercises[id] = { id, name: wanted };
  return state.exercises[id];
}

export function resetPlan() {
  const plan = defaultPlan();
  state.days = plan.days;
  // Keep custom exercises so past sessions still show their names.
  state.exercises = { ...state.exercises, ...plan.exercises };
  return savePlan();
}

// --- Backup ---

export function exportData() {
  return {
    app: 'eisen',
    version: 1,
    exportedAt: new Date().toISOString(),
    days: state.days,
    exercises: state.exercises,
    sessions: state.sessions,
  };
}

export const isValidBackup = (data) =>
  data?.app === 'eisen' &&
  Array.isArray(data.days) &&
  data.days.every((d) => d.id && Array.isArray(d.items)) &&
  data.exercises &&
  typeof data.exercises === 'object' &&
  Array.isArray(data.sessions) &&
  data.sessions.every((s) => s.id && s.dayId && s.date && s.log);

export async function importData(data) {
  const sessions = [...data.sessions].sort(byDate);
  const meta = { ...state.meta, lastBackupAt: Date.now() };
  await db.replaceAll({ days: data.days, exercises: data.exercises, meta }, sessions);
  Object.assign(state, { days: data.days, exercises: data.exercises, meta, sessions });
}
