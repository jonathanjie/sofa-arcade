/** Read-only presentation of Lala's forecast and the round sequence. */
const NAMES = Object.freeze({ jon: 'Jon', lydia: 'Lydia' });
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const inGrid = value => Number.isInteger(value) && value >= 0 && value < 5;
const coord = (row, col) => `${String.fromCharCode(65 + col)}${row + 1}`;

function direction(forecast) {
  return forecast.axis === 'row'
    ? (forecast.direction > 0 ? 'right' : 'left')
    : (forecast.direction > 0 ? 'down' : 'up');
}

function forecastLabel(forecast) {
  if (!forecast || forecast.type === 'nap') return 'Catnap';
  if (forecast.type === 'pounce') return `Pounce · ${coord(forecast.row, forecast.col)}`;
  if (forecast.type === 'swipe') return `${forecast.axis === 'row' ? `Row ${forecast.index + 1}` : `Column ${String.fromCharCode(65 + forecast.index)}`} · ${direction(forecast)}`;
  return 'Lala’s move';
}

/** Place this inside .board, after homes and before player pawns. */
export function forecastOverlay(game, affectedCells = [], icon = () => '') {
  const forecast = game?.phase === 'finished' ? null : game?.forecast;
  if (!forecast || forecast.type === 'nap') return '';
  if (forecast.type === 'swipe' && inGrid(forecast.index) && ['row', 'column'].includes(forecast.axis)) {
    const dir = direction(forecast);
    const offset = forecast.index * 20;
    const style = forecast.axis === 'row' ? `left:0;top:${offset}%;width:100%;height:20%` : `left:${offset}%;top:0;width:20%;height:100%`;
    return `<div class="forecast-lane ${forecast.axis} direction-${dir}" style="${style}" aria-hidden="true"><span class="forecast-lane-rail first"></span><span class="forecast-lane-rail last"></span><span class="forecast-edge-cue entry">${icon(dir)}</span><span class="forecast-edge-cue exit">${icon(dir)}</span><span class="forecast-lane-flow">${Array.from({ length: 3 }, () => `<i>${icon(dir)}</i>`).join('')}</span></div>`;
  }
  if (forecast.type === 'pounce' && inGrid(forecast.row) && inGrid(forecast.col)) {
    const validCells = affectedCells.filter(cell => inGrid(cell.row) && inGrid(cell.col));
    // The fallback paints the known cross even before the rules module has loaded.
    const cells = validCells.length ? validCells : [[0,0],[-1,0],[1,0],[0,-1],[0,1]].map(([dr,dc]) => ({row:forecast.row+dr,col:forecast.col+dc})).filter(cell => inGrid(cell.row) && inGrid(cell.col));
    return cells.map(cell => {
      const center = cell.row === forecast.row && cell.col === forecast.col;
      return `<div class="pounce-target-cell ${center ? 'pounce-center' : ''}" style="left:${cell.col * 20}%;top:${cell.row * 20}%" aria-hidden="true"><span class="pounce-target-fill"></span>${center ? `<span class="pounce-bullseye">${icon('paw')}</span>` : '<span class="pounce-corner-mark"></span>'}</div>`;
    }).join('');
  }
  return '';
}

/** Replaces the inner contents of .board-axis.top (column) or .left (row). */
export function axisLabels(game, axis) {
  const forecast = game?.phase === 'finished' ? null : game?.forecast;
  return Array.from({ length: 5 }, (_, index) => {
    const targeted = forecast?.type === 'swipe' && forecast.axis === axis && forecast.index === index;
    const label = axis === 'row' ? index + 1 : String.fromCharCode(65 + index);
    return `<span class="board-axis-label${targeted ? ' targeted' : ''}">${label}</span>`;
  }).join('');
}

/** A compact status strip: it explains the alternating starter without rule text. */
export function turnOrder(game, icon = () => '', firstInRound = null) {
  if (!game || game.phase === 'finished') return '';
  const initial = game.version >= 3 && game.firstPlayer === 'lydia' ? 'lydia' : 'jon';
  const first = firstInRound || (game.round % 2 === 1 ? initial : initial === 'jon' ? 'lydia' : 'jon');
  const second = first === 'jon' ? 'lydia' : 'jon';
  const position = game.turnInRound === 1 ? 1 : 0;
  const players = [first, second].map((id, index) => {
    const current = index === position;
    const done = index < position;
    return `<span class="round-order-seat ${id}${current ? ' current' : ''}${done ? ' complete' : ''}"${current ? ' aria-current="step"' : ''}><span class="round-order-symbol">${done ? icon('check') : '<i></i>'}</span>${NAMES[id]}</span>`;
  });
  return `<div class="round-order" role="group" aria-label="Round ${game.round} order: ${NAMES[first]}, then ${NAMES[second]}, then Lala. ${NAMES[game.activePlayer] || NAMES[first]} is playing."><span class="round-order-label">This round</span>${players.join('<span class="round-order-divider" aria-hidden="true">·</span>')}<span class="round-order-divider" aria-hidden="true">·</span><span class="round-order-cat">${icon('paw')} Lala</span></div>`;
}

/** Optional compact lookahead; accepts upcomingForecasts() entries with round. */
export function forecastLookahead(game, forecastList = [], icon = () => '') {
  if (!game || game.phase === 'finished') return '';
  const next = forecastList.find(forecast => forecast.round > game.round);
  if (!next) return '';
  const previewIcon = next.type === 'swipe' ? direction(next) : next.type === 'nap' ? 'clock' : 'paw';
  return `<div class="forecast-lookahead"><span>Next round</span><strong>${icon(previewIcon)} ${esc(forecastLabel(next))}</strong></div>`;
}
