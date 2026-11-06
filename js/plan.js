import { slug } from './util.js';

// [Name, Sätze, Wdh. von, Wdh. bis]
const DAYS = [
  {
    id: 'di',
    weekday: 2,
    color: 'red',
    title: 'Brust + Rücken (schwer)',
    items: [
      ['Schrägbankdrücken Kurzhantel', 3, 6, 10],
      ['Klimmzüge mit Gewicht', 3, 6, 10],
      ['Bankdrücken', 3, 6, 10],
      ['T-Bar-Rudern', 3, 8, 12],
      ['Butterfly', 3, 10, 15],
      ['Enger Latzug', 3, 8, 12],
      ['Seitheben Kabel', 3, 12, 20],
    ],
  },
  {
    id: 'do',
    weekday: 4,
    color: 'blue',
    title: 'Schultern + Arme',
    items: [
      ['Schulterdrücken', 3, 8, 12],
      ['Seitheben Kabel', 3, 12, 20],
      ['Seitheben Kurzhantel', 3, 15, 25],
      ['Face Pulls', 3, 12, 20],
      ['Preacher Curls', 3, 8, 12],
      ['Katana Extension', 3, 10, 15],
      ['Hammer Curls', 3, 8, 12],
      ['Trizeps Pulldown', 3, 10, 15],
    ],
  },
  {
    id: 'fr',
    weekday: 5,
    color: 'yellow',
    title: 'Beine + Bauch',
    items: [
      ['Beinpresse', 3, 10, 15],
      ['Beinstrecker', 3, 10, 15],
      ['Beinbeuger', 3, 10, 15],
      ['Adduktoren', 3, 10, 15],
      ['Waden', 3, 10, 15],
      ['Leg Raises', 3, 10, 15],
      ['Sit-ups', 3, 10, 15],
    ],
  },
  {
    id: 'so',
    weekday: 0,
    color: 'green',
    title: 'Brust + Rücken (Volumen) + Schultern',
    items: [
      ['Dips mit Gewicht', 3, 6, 10],
      ['Enger Latzug', 3, 8, 12],
      ['Schrägbankdrücken Kurzhantel', 3, 8, 12],
      ['Rudern', 3, 8, 12],
      ['Seitheben Kabel', 3, 12, 20],
      ['Reverse Butterfly', 3, 12, 20],
    ],
  },
];

export function defaultPlan() {
  const exercises = {};
  const days = DAYS.map((day) => ({
    ...day,
    items: day.items.map(([name, sets, repMin, repMax]) => {
      const exId = slug(name);
      exercises[exId] ??= { id: exId, name };
      return { id: `${day.id}-${exId}`, exId, sets, repMin, repMax };
    }),
  }));
  return { days, exercises };
}
