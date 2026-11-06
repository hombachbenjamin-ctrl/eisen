import { esc, fmtAxisDate } from './util.js';

const MARGIN = { top: 14, right: 16, bottom: 26, left: 40 };
const HEIGHT = 230;

function niceTicks(min, max, count = 4) {
  if (min === max) {
    min = Math.max(0, min - 1);
    max += 1;
  }
  const rough = (max - min) / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough);
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let value = start; value < max + step * 0.999; value += step) ticks.push(Number(value.toFixed(4)));
  return ticks;
}

const compact = (n) => (n >= 10000 ? `${Math.round(n / 1000)}K` : new Intl.NumberFormat('de-DE').format(n));

/**
 * series: [{ id, label, color, points: [{ x: ms, y, note }] }]
 * One line per training day: a heavy day and a volume day are not the same curve.
 */
export function renderChart(el, { series, unit }) {
  const width = el.clientWidth || 340;
  const points = series.flatMap((s) => s.points.map((p) => ({ ...p, serie: s })));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const yMin = ticks[0];
  const yMax = ticks.at(-1);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const px = (x) => MARGIN.left + (xMax === xMin ? plotW / 2 : ((x - xMin) / (xMax - xMin)) * plotW);
  const py = (y) => MARGIN.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

  const grid = ticks
    .map(
      (tick) => `
      <line class="ch-grid" x1="${MARGIN.left}" x2="${width - MARGIN.right}" y1="${py(tick)}" y2="${py(tick)}"/>
      <text class="ch-axis" x="${MARGIN.left - 8}" y="${py(tick)}" text-anchor="end" dominant-baseline="central">${compact(tick)}</text>`,
    )
    .join('');

  const dates = xMax === xMin ? [xMin] : [xMin, xMax];
  const axis = dates
    .map((x, i) => {
      const anchor = dates.length === 1 ? 'middle' : i === 0 ? 'start' : 'end';
      return `<text class="ch-axis" x="${px(x)}" y="${HEIGHT - 6}" text-anchor="${anchor}">${fmtAxisDate(x)}</text>`;
    })
    .join('');

  const lines = series
    .map((s) => {
      const path = s.points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(' ');
      const dots = s.points
        .map((p) => `<circle class="ch-dot" cx="${px(p.x)}" cy="${py(p.y)}" r="5" fill="${s.color}"/>`)
        .join('');
      return `<path class="ch-line" d="${path}" stroke="${s.color}"/>${dots}`;
    })
    .join('');

  const legend = series.length > 1
    ? `<ul class="ch-legend">${series
        .map((s) => `<li><i style="background:${s.color}"></i>${esc(s.label)}</li>`)
        .join('')}</ul>`
    : '';

  el.innerHTML = `
    ${legend}
    <div class="ch-plot">
      <svg width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" role="img" aria-label="Verlauf, Tabelle mit allen Werten steht darunter">
        ${grid}${axis}
        <line class="ch-cross" y1="${MARGIN.top}" y2="${MARGIN.top + plotH}" visibility="hidden"/>
        ${lines}
      </svg>
      <div class="ch-tip" hidden></div>
    </div>`;

  const plot = el.querySelector('.ch-plot');
  const cross = el.querySelector('.ch-cross');
  const tip = el.querySelector('.ch-tip');

  function show(event) {
    const box = plot.getBoundingClientRect();
    const x = event.clientX - box.left;
    const nearest = points.reduce((best, p) =>
      Math.abs(px(p.x) - x) < Math.abs(px(best.x) - x) ? p : best,
    );
    const cx = px(nearest.x);
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = `
      <strong>${esc(nearest.value)} ${esc(unit)}</strong>
      <span>${esc(nearest.note)}</span>`;
    const left = Math.min(Math.max(cx - tip.offsetWidth / 2, 0), width - tip.offsetWidth);
    tip.style.transform = `translateX(${left}px)`;
  }

  plot.addEventListener('pointerdown', show);
  plot.addEventListener('click', show);
  plot.addEventListener('pointermove', (event) => {
    if (event.pressure > 0 || event.pointerType === 'mouse') show(event);
  });
}
